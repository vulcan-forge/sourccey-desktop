import { useState } from 'react';
import { FaEye, FaShoppingCart, FaStar, FaStarHalfAlt, FaRegStar, FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import { HiChevronUp } from 'react-icons/hi';
import Image from 'next/image';
import { invoke } from '@tauri-apps/api/core';
import { getProfile } from '@/api/Local/Profile/profile';
import { mutationAddToCart } from '@/api/GraphQL/CartItem/Query';
import type { StoreItem } from '@/types/Models/store-item';

// Example checkout function - you can call this from a checkout page
// TODO: Update to use GraphQL queries instead of Tauri invokes
// import { queryValidateCartItems, type CartItemData } from '@/api/GraphQL/CartItem/Query';

export const checkoutCart = async (accountId: string) => {
    try {
        console.log('🛒 Starting cart validation for account:', accountId);

        // Step 1: Get cart items from local database
        const activeCartItems = await invoke('get_active_cart_items', {
            accountId: accountId,
            page: 1,
            pageSize: 100
        }) as any[];

        if (!activeCartItems || activeCartItems.length === 0) {
            throw new Error('No active cart items found to validate');
        }

        // Transform cart items to the format expected by C# backend
        const cartItemsData = activeCartItems.map(item => ({
            cart_item_id: item.id,
            store_item_id: item.store_item_id,
            quantity: item.quantity,
            price: parseFloat(item.price.toString()), // Convert Decimal to number
            currency: item.currency
        }));
        
        console.log('🛒 Found cart items to validate:', cartItemsData);

        // Step 2: Call C# backend via frontend GraphQL client (like sync does)
        // TODO: Restore queryValidateCartItems function
        // const validationResult = await queryValidateCartItems(cartItemsData, true);
        // console.log('✅ C# backend validation completed:', validationResult);
        const validationResult = { success: true }; // Temporary placeholder

        // Step 3: Pass validation result to Rust for local DB updates (like sync does)
        const syncResult = await invoke('sync_cart_validation', {
            input: {
                validation_result: validationResult
            }
        });

        console.log('✅ Cart validation sync completed:', syncResult);
        return syncResult;

    } catch (error) {
        console.error('❌ Cart validation failed:', error);
        throw error;
    }
};

export const StoreCard = ({ item }: { item: StoreItem }) => {
    const [showDetails, setShowDetails] = useState(false);
    const [isAddingToCart, setIsAddingToCart] = useState(false);
    const [cartFeedback, setCartFeedback] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    const handleAddToCart = async () => {
        setIsAddingToCart(true);
        setCartFeedback(null);

        try {
            // Get current profile for account_id
            const profile = await getProfile();
            if (!profile) {
                throw new Error('No profile found. Please log in first.');
            }

            console.log('🛒 Adding to cart:', {
                item: item.name,
                storeItemId: item.id,
                accountId: profile.id,
                quantity: 1,
                price: item.price,
                currency: item.currency
            });

            // Call the GraphQL addToCart mutation
            const result = await mutationAddToCart({
                account_id: profile.id,
                store_item_id: item.id,
                quantity: 1,
                price: item.price,
                currency: item.currency,
                status: "ACTIVE"
            });

            console.log('✅ Add to cart response:', result);

            if (result.error) {
                throw new Error(result.error.message);
            }

            // Show success feedback
            setCartFeedback({
                type: 'success',
                message: result.cartItem ? `Added ${item.name} to cart!` : `Updated quantity of ${item.name} in cart!`
            });

            // Clear feedback after 3 seconds
            setTimeout(() => setCartFeedback(null), 3000);

        } catch (error: any) {
            console.error('❌ Error adding to cart:', error);

            // Show error feedback
            setCartFeedback({
                type: 'error',
                message: error?.message || 'Failed to add item to cart. Please try again.'
            });

            // Clear error feedback after 5 seconds
            setTimeout(() => setCartFeedback(null), 5000);
        } finally {
            setIsAddingToCart(false);
        }
    };

    const renderStars = (rating: number) => {
        const stars = [];
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 !== 0;

        for (let i = 0; i < fullStars; i++) {
            stars.push(<FaStar key={i} className="h-4 w-4 text-yellow-400" />);
        }

        if (hasHalfStar) {
            stars.push(<FaStarHalfAlt key="half" className="h-4 w-4 text-yellow-400" />);
        }

        const remainingStars = 5 - Math.ceil(rating);
        for (let i = 0; i < remainingStars; i++) {
            stars.push(<FaRegStar key={`empty-${i}`} className="h-4 w-4 text-slate-600" />);
        }

        return stars;
    };

    const formatPrice = (price: number, currency: string) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
        }).format(price);
    };

    return (
        <div className="rounded-xl border-2 border-slate-700/50 bg-slate-800/50 backdrop-blur-sm transition-all duration-300 hover:border-slate-600/50 hover:shadow-lg">
            {/* Item Header */}
            <div className="flex flex-col gap-4 p-6">
                <div className="flex items-start space-x-4">
                    <div className="h-16 w-16 overflow-hidden rounded-lg bg-slate-700">
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-500/20 to-orange-600/20">
                            {item.image ? (
                                <Image
                                    src={item.image}
                                    alt={item.name}
                                    width={64}
                                    height={64}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <FaShoppingCart className="h-8 w-8 text-orange-500" />
                            )}
                        </div>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-white">{item.name}</h3>
                                <p className="mt-1 text-sm text-slate-300 line-clamp-2">
                                    {item.short_description || item.description || 'No description available'}
                                </p>
                            </div>
                            <div className="ml-4 text-right">
                                <div className="text-xl font-bold text-orange-400">
                                    {formatPrice(item.price, item.currency)}
                                </div>
                                {!(item.inStock !== undefined ? item.inStock : item.stock_quantity > 0) && (
                                    <div className="text-xs text-red-400">Out of Stock</div>
                                )}
                            </div>
                        </div>

                        {/* Stock Status */}
                        <div className="mt-2 flex items-center gap-2">
                            <span className="text-sm text-slate-400">
                                {(item.inStock !== undefined ? item.inStock : item.stock_quantity > 0) ? 
                                    `In Stock (${item.stock_quantity})` : 'Out of Stock'}
                            </span>
                        </div>

                        {/* Tags */}
                        <div className="mt-2 flex flex-wrap gap-1">
                            {item.tags.slice(0, 3).map((tag) => (
                                <span
                                    key={tag}
                                    className="rounded-full bg-slate-700/50 px-2 py-1 text-xs text-slate-300"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2">
                    {/* Cart Feedback */}
                    {cartFeedback && (
                        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                            cartFeedback.type === 'success'
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                            {cartFeedback.type === 'success' ? (
                                <FaCheck className="h-4 w-4" />
                            ) : (
                                <FaExclamationTriangle className="h-4 w-4" />
                            )}
                            <span>{cartFeedback.message}</span>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            onClick={handleAddToCart}
                            disabled={
                                !(item.inStock !== undefined ? item.inStock : item.stock_quantity > 0) ||
                                isAddingToCart
                            }
                            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300 ${
                                (item.inStock !== undefined ? item.inStock : item.stock_quantity > 0) && !isAddingToCart
                                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700'
                                    : 'cursor-not-allowed bg-slate-600 text-slate-400'
                            }`}
                        >
                            {isAddingToCart ? (
                                <>
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                    <span>Adding...</span>
                                </>
                            ) : (
                                <>
                                    <FaShoppingCart className="h-4 w-4" />
                                    <span>
                                        {(item.inStock !== undefined ? item.inStock : item.stock_quantity > 0)
                                            ? 'Add to Cart'
                                            : 'Out of Stock'
                                        }
                                    </span>
                                </>
                            )}
                        </button>

                    <button
                        onClick={() => setShowDetails(!showDetails)}
                        className="flex cursor-pointer items-center justify-center gap-1 rounded-lg bg-slate-700/50 px-3 py-2 text-sm font-medium text-slate-300 transition-colors duration-200 hover:bg-slate-600/50 hover:text-white"
                    >
                        {showDetails ? (
                            <>
                                <HiChevronUp className="h-4 w-4" />
                                <span>Less</span>
                            </>
                        ) : (
                            <>
                                <FaEye className="h-4 w-4" />
                                <span>More</span>
                            </>
                        )}
                    </button>
                    </div>
                </div>
            </div>

            {/* Expanded Content */}
            {showDetails && (
                <div className="border-t border-slate-700/50 bg-slate-700/30 p-6">
                    <div className="space-y-4">
                        {item.description && (
                            <div>
                                <h4 className="font-semibold text-white">Description</h4>
                                <p className="mt-1 text-sm text-slate-300">{item.description}</p>
                            </div>
                        )}

                        {/* Features */}
                        {item.features && item.features.length > 0 && (
                            <div>
                                <h4 className="font-semibold text-white">Features</h4>
                                <div className="mt-2 grid grid-cols-1 gap-2">
                                    {item.features.map((feature) => (
                                        <div key={feature.id} className="flex items-start gap-2">
                                            <div className="mt-0.5 h-2 w-2 rounded-full bg-orange-500"></div>
                                            <div>
                                                <div className="text-sm font-medium text-white">
                                                    {feature.name}
                                                </div>
                                                <div className="text-xs text-slate-400">
                                                    {feature.description}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-400">Category: {item.category}</span>
                            {item.is_featured && (
                                <span className="rounded-full bg-gradient-to-r from-orange-500/20 to-orange-600/20 px-2 py-1 text-xs text-orange-400">
                                    Featured
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
