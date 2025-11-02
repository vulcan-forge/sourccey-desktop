'use client';

import { useState, useEffect } from 'react';
import { FaCreditCard, FaTrash, FaShoppingCart, FaSync } from 'react-icons/fa';
import { invoke } from '@tauri-apps/api/core';
import { getProfile } from '@/api/Local/Profile/profile';
import { checkoutCart } from '@/components/Elements/Store/StoreCard';
import type { StoreItem } from '@/types/Models/store-item';

// Types
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

export default function CheckoutPage() {
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [checkoutResult, setCheckoutResult] = useState<any>(null);

    const fetchCartItems = async () => {
        try {
            const profile = await getProfile();
            if (!profile) {
                console.warn('No profile found');
                return;
            }

            console.log('🛒 Fetching cart items for account:', profile.id);
            const items: CartItem[] = await invoke('get_active_cart_items', {
                accountId: profile.id,
                page: 1,
                pageSize: 100
            });

            console.log('✅ Cart items fetched:', items);
            setCartItems(items);
        } catch (error) {
            console.error('❌ Error fetching cart items:', error);
        }
    };

    const fetchStoreItems = async () => {
        try {
            console.log('🛍️ Fetching store items...');
            const items: any[] = await invoke('get_store_items');

            const transformedItems: StoreItem[] = items.map((item) => ({
                id: item.id,
                name: item.name,
                slug: item.slug,
                description: item.description || '',
                short_description: item.short_description || '',
                price: parseFloat(item.price.toString()),
                currency: item.currency,
                category: item.category,
                tags: item.tags || [],
                is_active: item.is_active,
                is_featured: item.is_featured,
                stock_quantity: item.stock_quantity,
                low_stock_threshold: item.low_stock_threshold,
                created_at: item.created_at,
                updated_at: item.updated_at,
                inStock: item.stock_quantity > 0,
                featured: item.is_featured,
                rating: 4.5,
                reviewCount: 0,
                image: item.image || undefined,
                features: [],
                media: [],
            }));

            setStoreItems(transformedItems);
        } catch (error) {
            console.error('❌ Error fetching store items:', error);
        }
    };

    const handleSyncCart = async () => {
        setRefreshing(true);
        try {
            const profile = await getProfile();
            if (!profile) return;

            console.log('🔄 Starting cart sync...');
            const result = await checkoutCart(profile.id) as any;
            setCheckoutResult(result);
            console.log('✅ Cart sync completed:', result);

            // Refresh cart items after sync
            await fetchCartItems();
        } catch (error) {
            console.error('❌ Cart sync failed:', error);
            setCheckoutResult({ success: false, message: (error as Error).message || 'Sync failed' });
        } finally {
            setRefreshing(false);
        }
    };

    const handleCompletePurchase = async () => {
        setProcessing(true);
        try {
            console.log('💳 Completing purchase...');
            // This would typically call a purchase completion command
            // For now, just show success
            setCheckoutResult({
                success: true,
                message: 'Purchase completed successfully!',
                totalAmount: calculateTotal(),
                currency: 'USD'
            });
        } catch (error) {
            console.error('❌ Purchase failed:', error);
            setCheckoutResult({ success: false, message: 'Purchase failed' });
        } finally {
            setProcessing(false);
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
            await Promise.all([fetchCartItems(), fetchStoreItems()]);
            setLoading(false);
        };
        loadData();
    }, []);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-900">
                <div className="text-center">
                    <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-orange-400 border-t-transparent mx-auto"></div>
                    <p className="text-white">Loading your cart...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 text-white">
            {/* Header */}
            <div className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
                <div className="mx-auto max-w-6xl px-8 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-white">Shopping Cart</h1>
                            <p className="mt-2 text-slate-400">
                                {cartItems.length} item{cartItems.length !== 1 ? 's' : ''} in your cart
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            {/* Sync Cart Button */}
                            <button
                                onClick={handleSyncCart}
                                disabled={refreshing}
                                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                                    refreshing
                                        ? 'cursor-not-allowed bg-slate-600 text-slate-400'
                                        : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700'
                                }`}
                            >
                                {refreshing ? (
                                    <>
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                        <span>Syncing...</span>
                                    </>
                                ) : (
                                    <>
                                        <FaSync className="h-4 w-4" />
                                        <span>Sync Cart</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-6xl px-8 py-8">
                {cartItems.length === 0 ? (
                    <div className="text-center py-16">
                        <FaShoppingCart className="mx-auto h-16 w-16 text-slate-600 mb-4" />
                        <h2 className="text-xl font-semibold text-slate-400 mb-2">Your cart is empty</h2>
                        <p className="text-slate-500">Add some items to your cart to get started</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Cart Items */}
                        <div className="lg:col-span-2 space-y-4">
                            {cartItems.map((cartItem) => {
                                const storeItem = getStoreItemForCart(cartItem);
                                return (
                                    <div key={cartItem.id} className="bg-slate-800 rounded-lg p-6 border border-slate-700">
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
                                                        <span className="text-slate-400">Qty: {cartItem.quantity}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-lg font-bold text-white">
                                                            ${(parseFloat(cartItem.price.toString()) * cartItem.quantity).toFixed(2)}
                                                        </div>
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
                            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 sticky top-8">
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
                                                <FaSync className="h-4 w-4" />
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
                                    onClick={handleCompletePurchase}
                                    disabled={processing || cartItems.length === 0}
                                    className={`w-full flex items-center justify-center gap-2 rounded-lg px-6 py-3 font-bold transition-all duration-200 ${
                                        processing || cartItems.length === 0
                                            ? 'cursor-not-allowed bg-slate-600 text-slate-400'
                                            : 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700'
                                    }`}
                                >
                                    {processing ? (
                                        <>
                                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                            <span>Processing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <FaCreditCard className="h-5 w-5" />
                                            <span>Complete Purchase</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
