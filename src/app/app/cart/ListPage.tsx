'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FaShoppingCart, FaTrash, FaPlus, FaMinus, FaArrowLeft, FaCheckCircle, FaStore } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { getProfile } from '@/api/Local/Profile/profile';
import { queryActiveCartItems, mutationUpdateCartItem, mutationRemoveFromCart, mutationCheckoutCart, queryGetSavedPaymentMethods, mutationCreateOffSessionPayment } from '@/api/GraphQL/CartItem/Query';
import { getAllStoreItems } from '@/api/Local/Store/store';
import { StripePaymentWrapper } from '@/components/Payment/StripePaymentForm';
import type { StoreItem } from '@/types/Models/store-item';

// Types based on checkout page
interface CartItem {
    id: string;
    account_id: string;
    store_item_id: string;
    quantity: number;
    price: string;
    currency: string;
    status: string;
    time_purchased: string | null;
    created_at: string;
    updated_at: string;
}

interface StoreItemWithCart extends StoreItem {
    cart_quantity: number;
    cart_item_id: string;
    cart_status: string;
}

export const CartListPage = () => {
    const router = useRouter();
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [checkoutResult, setCheckoutResult] = useState<any>(null);
    const [processingCheckout, setProcessingCheckout] = useState(false);
    const [checkoutPhase, setCheckoutPhase] = useState<'cart' | 'processing' | 'payment' | 'success' | 'error'>('cart');
    const [paymentIntent, setPaymentIntent] = useState<any>(null);
    const [savedPaymentMethods, setSavedPaymentMethods] = useState<any[]>([]);
    const [hasProfile, setHasProfile] = useState<boolean | null>(null);

    const fetchCartItems = async () => {
        try {
            const profile = await getProfile();
            if (!profile) {
                console.warn('⚠️ No profile found - user needs to log in');
                setHasProfile(false);
                setCartItems([]);
                return;
            }
            
            setHasProfile(true);

            console.log('🛒 Fetching cart items for account:', profile.id);
            const response = await queryActiveCartItems(profile.id, {
                first: 50, // Backend pagination limit
            });

            if (!response.edges || response.edges.length === 0) {
                console.log('🛒 No cart items found');
                setCartItems([]);
                return;
            }

            // Transform GraphQL response to CartItem format
            const items: CartItem[] = response.edges.map((edge: any) => ({
                id: edge.node.id,
                account_id: edge.node.account_id,
                store_item_id: edge.node.store_item_id,
                quantity: edge.node.quantity,
                price: edge.node.price.toString(),
                currency: edge.node.currency,
                status: edge.node.status,
                time_purchased: edge.node.time_purchased,
                created_at: edge.node.created_at,
                updated_at: edge.node.updated_at,
            }));

            console.log('✅ Cart items fetched:', items);
            setCartItems(items);
        } catch (error) {
            console.error('❌ Error fetching cart items:', error);
        }
    };

    const fetchStoreItems = async () => {
        try {
            console.log('🛍️ Fetching store items via GraphQL...');
            const items = await getAllStoreItems();
            setStoreItems(items);
            console.log('✅ Store items fetched:', items);
        } catch (error) {
            console.error('❌ Error fetching store items:', error);
        }
    };


    const handleCheckout = async () => {
        if (cartItems.length === 0) return;

        setCheckoutPhase('processing');
        setProcessingCheckout(true);
        setCheckoutResult(null);

        try {
            const profile = await getProfile();
            if (!profile) {
                throw new Error('No profile found. Please log in first.');
            }

            // Extract cart item IDs
            const cartItemIds = cartItems.map(item => item.id);

            console.log('💳 Starting checkout process...', {
                cartItemIds,
                totalItems: cartItems.length
            });

            console.log('🛒 Calling checkout mutation with:', {
                account_id: profile.id,
                cart_item_ids: cartItemIds,
                currency: 'USD',
                customer_email: profile.email || 'customer@example.com'
            });

            // Call the checkout mutation with real profile data
            console.log('🚀 1. SENDING TO BACKEND - Checkout mutation request:', {
                account_id: profile.id,
                cart_item_ids: cartItemIds,
                currency: "USD",
                customer_email: profile.email || `${profile.handle}@example.com`,
                cart_item_count: cartItemIds.length,
                calculated_total: calculateTotal()
            });

            const checkoutResponse = await mutationCheckoutCart({
                account_id: profile.id,
                cart_item_ids: cartItemIds,
                currency: "USD",
                customer_email: profile.email || `${profile.handle}@example.com`
            });

            console.log('📨 1. BACKEND RESPONSE - Checkout mutation response:', {
                full_response: checkoutResponse,
                payment_intent_id: checkoutResponse.payment_intent_id,
                client_secret: checkoutResponse.client_secret ? `${checkoutResponse.client_secret.substring(0, 50)}...` : null,
                total_amount: checkoutResponse.total_amount,
                currency: checkoutResponse.currency,
                status: checkoutResponse.status,
                error: checkoutResponse.error,
                processed_cart_items_count: checkoutResponse.processed_cart_items?.length || 0
            });

            if (checkoutResponse.error) {
                throw new Error(checkoutResponse.error.message);
            }

            console.log('✅ Checkout initiated:', checkoutResponse);

            if (checkoutResponse.client_secret) {
                // Verify the amount matches what we calculated
                const calculatedTotal = calculateTotal();
                const serverTotal = checkoutResponse.total_amount;

                if (serverTotal && Math.abs(calculatedTotal - serverTotal) > 0.01) {
                    console.warn('💰 Amount mismatch detected:', {
                        frontend: calculatedTotal,
                        backend: serverTotal
                    });
                    throw new Error('Payment amount verification failed. Please refresh and try again.');
                }

                console.log('✅ Payment amount verified:', {
                    amount: serverTotal,
                    currency: checkoutResponse.currency
                });

                // Move to payment phase with Stripe form
                setPaymentIntent({
                    id: checkoutResponse.payment_intent_id,
                    client_secret: checkoutResponse.client_secret,
                    amount: checkoutResponse.total_amount,
                    currency: checkoutResponse.currency
                });
                setCheckoutPhase('payment');
            } else {
                // If no client_secret, treat as immediate success
                setCheckoutResult({
                    success: true,
                    message: 'Checkout completed successfully!',
                    paymentIntentId: checkoutResponse.payment_intent_id,
                    totalAmount: checkoutResponse.total_amount,
                    currency: checkoutResponse.currency
                });
                setCheckoutPhase('success');
                await fetchCartItems();
            }

        } catch (error: any) {
            console.error('❌ Checkout failed:', error);
            setCheckoutResult({
                success: false,
                message: error.message || 'Checkout failed. Please try again.'
            });
            setCheckoutPhase('error');
        } finally {
            setProcessingCheckout(false);
        }
    };

    const handlePaymentSuccess = async (paymentIntent: any) => {
        console.log('💳 Payment successful:', paymentIntent);

        setCheckoutResult({
            success: true,
            message: 'Payment completed successfully!',
            paymentIntentId: paymentIntent?.id,
            totalAmount: (paymentIntent?.amount ?? 0) / 100,
            currency: (paymentIntent?.currency ?? 'usd').toUpperCase()
        });

        setCheckoutPhase('success');
        await fetchCartItems();
    };

    const handlePaymentError = (error: any) => {
        console.error('💳 Payment failed:', error);

        setCheckoutResult({
            success: false,
            message: error.message || 'Payment failed. Please try again.'
        });

        setCheckoutPhase('error');
    };

    const fetchSavedPaymentMethods = async () => {
        // Skip this query for now since it's not implemented yet
        console.log('ℹ️ Saved payment methods query not implemented yet, using empty array');
        setSavedPaymentMethods([]);
    };

    const handleOffSessionPayment = async (paymentMethodId: string) => {
        if (cartItems.length === 0) return;

        setProcessingCheckout(true);
        setCheckoutResult(null);

        try {
            const profile = await getProfile();
            if (!profile) {
                throw new Error('No profile found. Please log in first.');
            }

            const totalAmount = calculateTotal();

            console.log('💳 Processing off-session payment...', {
                paymentMethodId,
                amount: totalAmount,
                cartItemIds: cartItems.map(item => item.id),
                account_id: profile.id
            });

            const response = await mutationCreateOffSessionPayment({
                account_id: profile.id,
                amount: totalAmount,
                currency: "USD",
                payment_method_id: paymentMethodId
            });

            if (response.error) {
                throw new Error(response.error.message);
            }

            console.log('✅ Off-session payment successful:', response);
            setCheckoutResult({
                success: true,
                message: 'Payment completed successfully!',
                paymentIntentId: response.payment_intent_id,
                totalAmount: response.amount,
                currency: response.currency
            });

            setCheckoutPhase('success');
            await fetchCartItems();

        } catch (error: any) {
            console.error('❌ Off-session payment failed:', error);
            
            // Check if it's a 400 error (mutation not implemented)
            if (error.message?.includes('400') || error.message?.includes('Bad Request')) {
                setCheckoutResult({
                    success: false,
                    message: 'Off-session payment not implemented yet. Please use the regular checkout flow.'
                });
            } else {
                setCheckoutResult({
                    success: false,
                    message: error.message || 'Payment failed. Please try again.'
                });
            }
            setCheckoutPhase('error');
        } finally {
            setProcessingCheckout(false);
        }
    };

    const handleBackToCart = () => {
        setCheckoutPhase('cart');
        setPaymentIntent(null);
        setCheckoutResult(null);
    };

    const handleRemoveItem = async (cartItemId: string) => {
        try {
            console.log('🗑️ Removing item from cart:', cartItemId);
            const response = await mutationRemoveFromCart({
                ids: [cartItemId]
            });

            if (response.error) {
                console.error('❌ Error removing item from cart:', response.error.message);
                return;
            }

            // Refresh cart after removal
            await fetchCartItems();
            console.log('✅ Item removed from cart');
        } catch (error) {
            console.error('❌ Error removing item from cart:', error);
        }
    };

    const handleUpdateQuantity = async (cartItemId: string, newQuantity: number) => {
        if (newQuantity <= 0) {
            handleRemoveItem(cartItemId);
            return;
        }

        try {
            console.log('📊 Updating cart item quantity:', cartItemId, newQuantity);
            const response = await mutationUpdateCartItem({
                id: cartItemId,
                quantity: newQuantity
            });

            if (response.error) {
                console.error('❌ Error updating cart item quantity:', response.error.message);
                return;
            }

            // Refresh cart after update
            await fetchCartItems();
            console.log('✅ Cart item quantity updated');
        } catch (error) {
            console.error('❌ Error updating cart item quantity:', error);
        }
    };

    const calculateTotal = () => {
        return cartItems.reduce((total, item) => {
            return total + (parseFloat(item.price.toString()) * item.quantity);
        }, 0);
    };

    const getStoreItemForCart = (cartItem: CartItem): StoreItem | undefined => {
        return storeItems.find(item => item.id === cartItem.store_item_id);
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            await Promise.all([
                fetchCartItems(),
                fetchStoreItems(),
                fetchSavedPaymentMethods() // Load saved payment methods
            ]);
            setLoading(false);
        };
        loadData();
    }, []);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent mx-auto"></div>
                    <p className="mt-2 text-slate-400">Loading your cart...</p>
                </div>
            </div>
        );
    }

    // Processing phase - show checkout processing
    if (checkoutPhase === 'processing') {
        return (
            <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md w-full text-center">
                    <div className="bg-slate-800/50 rounded-lg p-8 backdrop-blur-sm border border-slate-700/50">
                        <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Processing payment…</h2>
                        <p className="text-slate-400">
                            Please wait while we securely confirm your payment…
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Payment phase - show Stripe payment form
    if (checkoutPhase === 'payment' && paymentIntent) {
        return (
            <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-2xl w-full">
                    <div className="flex items-center justify-between mb-6">
                        <button
                            onClick={handleBackToCart}
                            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                        >
                            <FaArrowLeft className="h-4 w-4" />
                            Back to Cart
                        </button>
                        <h2 className="text-xl font-bold text-white">Complete Payment</h2>
                    </div>

                    <StripePaymentWrapper
                        clientSecret={paymentIntent.client_secret}
                        amount={paymentIntent.amount || 0}
                        currency={paymentIntent.currency || 'USD'}
                        onPaymentSuccess={handlePaymentSuccess}
                        onPaymentError={handlePaymentError}
                    />
                </div>
            </div>
        );
    }

    // Success phase
    if (checkoutPhase === 'success') {
        return (
            <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md w-full text-center">
                    <div className="bg-slate-800/50 rounded-lg p-8 backdrop-blur-sm border border-slate-700/50">
                        <FaCheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-white mb-2">Payment Successful!</h2>
                        <p className="text-slate-400 mb-6">
                            Your payment has been processed successfully and your card has been saved for future purchases.
                        </p>

                        {checkoutResult?.paymentIntentId && (
                            <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
                                <p className="text-sm text-slate-400 mb-1">Payment ID</p>
                                <p className="font-mono text-sm text-slate-300 break-all">
                                    {checkoutResult.paymentIntentId}
                                </p>
                            </div>
                        )}

                        <button
                            onClick={handleBackToCart}
                            className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-green-600 hover:to-green-700 transition-all duration-200"
                        >
                            Continue Shopping
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Error phase
    if (checkoutPhase === 'error') {
        return (
            <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md w-full text-center">
                    <div className="bg-slate-800/50 rounded-lg p-8 backdrop-blur-sm border border-slate-700/50">
                        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FaShoppingCart className="h-8 w-8 text-red-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Payment Failed</h2>
                        <p className="text-slate-400 mb-6">
                            {checkoutResult?.message || 'There was an error processing your payment.'}
                        </p>

                        <div className="space-y-3">
                            <button
                                onClick={() => setCheckoutPhase('cart')}
                                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 transition-all duration-200"
                            >
                                Try Again
                            </button>

                            <button
                                onClick={handleBackToCart}
                                className="w-full bg-slate-700/50 text-slate-300 px-6 py-3 rounded-lg font-semibold hover:bg-slate-600/50 transition-all duration-200"
                            >
                                Back to Cart
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {/* Header */}
            <div className="border-b border-slate-700/50 bg-slate-800/60 p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Shopping Cart</h1>
                        <p className="mt-2 text-slate-400">
                            {cartItems.length} item{cartItems.length !== 1 ? 's' : ''} in your cart
                        </p>
                    </div>
                    
                    <button
                        onClick={() => router.push('/app/store')}
                        className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 px-4 py-2 text-slate-300 hover:from-blue-500/30 hover:to-purple-500/30 hover:text-white transition-all duration-200 border border-slate-600/50 hover:border-blue-400/50 shadow-lg hover:shadow-blue-500/25"
                    >
                        <FaStore className="h-4 w-4" />
                        Back to Store
                    </button>
                </div>
            </div>

            {/* Cart Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {hasProfile === false ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <FaShoppingCart className="h-16 w-16 text-slate-600" />
                        <h2 className="mt-4 text-xl font-semibold text-white">Please log in to view your cart</h2>
                        <p className="mt-2 text-slate-400">You need to create a profile or log in to use the shopping cart</p>
                        <button
                            onClick={() => router.push('/app/store')}
                            className="mt-4 flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-2 font-semibold text-white transition-all duration-200 hover:from-blue-600 hover:to-blue-700"
                        >
                            <FaStore className="h-4 w-4" />
                            Go to Store
                        </button>
                    </div>
                ) : cartItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <FaShoppingCart className="h-16 w-16 text-slate-600" />
                        <h2 className="mt-4 text-xl font-semibold text-white">Your cart is empty</h2>
                        <p className="mt-2 text-slate-400">Add some items from the store to get started</p>
                        <button
                            onClick={() => router.push('/app/store')}
                            className="mt-4 flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-6 py-2 font-semibold text-white transition-all duration-200 hover:from-green-600 hover:to-green-700"
                        >
                            <FaStore className="h-4 w-4" />
                            Browse Store
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Saved Payment Methods - Only show if backend supports it */}
                        {savedPaymentMethods.length > 0 && (
                            <div className="mb-6 bg-slate-800/50 rounded-lg p-6 border border-slate-700/50 backdrop-blur-sm">
                                <h2 className="text-xl font-bold text-white mb-4">Quick Checkout</h2>
                                <p className="text-slate-400 mb-4">Use a saved payment method:</p>
                                <div className="space-y-3">
                                    {savedPaymentMethods.map((method) => (
                                        <div key={method.id} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <div className="text-2xl">
                                                    {method.card.brand === 'visa' && '💳'}
                                                    {method.card.brand === 'mastercard' && '💳'}
                                                    {method.card.brand === 'amex' && '💳'}
                                                    {!['visa', 'mastercard', 'amex'].includes(method.card.brand) && '💳'}
                                                </div>
                                                <div>
                                                    <p className="text-white font-medium">
                                                        {method.card.brand.charAt(0).toUpperCase() + method.card.brand.slice(1)} ****{method.card.last4}
                                                    </p>
                                                    <p className="text-slate-400 text-sm">
                                                        Expires {method.card.exp_month}/{method.card.exp_year}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleOffSessionPayment(method.id)}
                                                disabled={processingCheckout}
                                                className="bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors duration-200"
                                            >
                                                {processingCheckout ? 'Processing...' : `Pay $${calculateTotal().toFixed(2)}`}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 pt-4 border-t border-slate-600">
                                    <p className="text-slate-400 text-sm text-center">Or enter new payment method below</p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Cart Items */}
                            <div className="lg:col-span-2 space-y-4">
                            {cartItems.map((cartItem) => {
                                const storeItem = getStoreItemForCart(cartItem);
                                return (
                                    <div key={cartItem.id} className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50 backdrop-blur-sm">
                                        <div className="flex items-start gap-4">
                                            <div className="h-20 w-20 bg-slate-700 rounded-lg flex items-center justify-center">
                                                <FaShoppingCart className="h-8 w-8 text-slate-400" />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="text-lg font-semibold text-white">
                                                    {storeItem?.name || 'Unknown Item'}
                                                </h3>
                                                <p className="text-slate-400 text-sm mt-1">
                                                    {storeItem?.short_description || storeItem?.description}
                                                </p>
                                                <div className="flex items-center justify-between mt-4">
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-lg font-bold text-orange-400">
                                                            ${parseFloat(cartItem.price.toString()).toFixed(2)} {cartItem.currency}
                                                        </span>
                                                        {/* Quantity Controls */}
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleUpdateQuantity(cartItem.id, cartItem.quantity - 1)}
                                                                className="flex h-8 w-8 items-center justify-center rounded bg-slate-700 text-white hover:bg-slate-600 transition-colors"
                                                            >
                                                                <FaMinus className="h-3 w-3" />
                                                            </button>
                                                            <span className="min-w-8 text-center text-white">{cartItem.quantity}</span>
                                                            <button
                                                                onClick={() => handleUpdateQuantity(cartItem.id, cartItem.quantity + 1)}
                                                                className="flex h-8 w-8 items-center justify-center rounded bg-slate-700 text-white hover:bg-slate-600 transition-colors"
                                                            >
                                                                <FaPlus className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right">
                                                            <div className="text-lg font-bold text-white">
                                                                ${(parseFloat(cartItem.price.toString()) * cartItem.quantity).toFixed(2)}
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemoveItem(cartItem.id)}
                                                            className="flex h-8 w-8 items-center justify-center rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                                                        >
                                                            <FaTrash className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Order Summary */}
                        <div className="lg:col-span-1">
                            <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50 backdrop-blur-sm sticky top-8">
                                <h3 className="text-xl font-bold text-white mb-4">Order Summary</h3>

                                <div className="space-y-3 mb-6">
                                    <div className="flex justify-between text-slate-400">
                                        <span>Subtotal ({cartItems.length} items)</span>
                                        <span>${calculateTotal().toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-400">
                                        <span>Shipping</span>
                                        <span>FREE</span>
                                    </div>
                                    <div className="flex justify-between text-slate-400">
                                        <span>Tax</span>
                                        <span>$0.00</span>
                                    </div>
                                    <hr className="border-slate-700" />
                                    <div className="flex justify-between text-xl font-bold text-white">
                                        <span>Total</span>
                                        <span>${calculateTotal().toFixed(2)}</span>
                                    </div>
                                </div>

                                {/* Checkout Result */}
                                {checkoutResult && (
                                    <div className={`mb-4 rounded-lg p-3 text-sm ${
                                        checkoutResult.success
                                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                    }`}>
                                        <div className="flex items-center gap-2">
                                            {checkoutResult.success ? (
                                                <FaCheckCircle className="h-4 w-4" />
                                            ) : (
                                                <FaTrash className="h-4 w-4" />
                                            )}
                                            <div className="flex flex-col">
                                                <span className="font-medium">{checkoutResult.message}</span>
                                                {checkoutResult.success && (
                                                    <span className="text-xs text-slate-300">
                                                        Total: ${checkoutResult.totalAmount || calculateTotal().toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={handleCheckout}
                                    disabled={processingCheckout || cartItems.length === 0}
                                    className="w-full flex items-center justify-center gap-2 rounded-lg px-6 py-3 font-bold bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {processingCheckout ? (
                                        <>
                                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                            <span>Processing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <FaShoppingCart className="h-5 w-5" />
                                            <span>Proceed to Checkout</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                    </>
                )}
            </div>
        </div>
    );
};
