'use client';

import { getAllStoreItems } from '@/api/Local/Store/store';
import type { StoreItem } from '@/types/Models/store-item';
import { StoreCard } from '@/components/Elements/Store/StoreCard';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FaStore, FaSearch, FaShoppingCart } from 'react-icons/fa';
import { HiChevronDown } from 'react-icons/hi';

export const StoreListPage = () => {
    const router = useRouter();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedPriceRange, setSelectedPriceRange] = useState<string>('all');
    const [showOnlyInStock, setShowOnlyInStock] = useState(false);
    const [showOnlyFeatured, setShowOnlyFeatured] = useState(false);

    const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStoreItems = async (setter: (items: StoreItem[]) => void) => {
        setLoading(true);
        setError(null);

        try {
            const result = await getAllStoreItems();
            setter(result);
        } catch (err: any) {
            console.error('Error details:', err);
            
            // Check if it's a backend schema error
            if (err.message?.includes('500') || err.message?.includes('SchemaException')) {
                setError('Backend schema error - please check server logs. Using mock data for now.');
                // Fallback to mock data
                setter([
                    {
                        id: 'mock-1',
                        name: 'Sample Robot Kit',
                        slug: 'sample-robot-kit',
                        description: 'A complete robot building kit for beginners',
                        short_description: 'Beginner robot kit',
                        price: 99.99,
                        currency: 'USD',
                        category: 'ROBOT_KIT',
                        tags: ['beginner', 'kit', 'robot'],
                        is_active: true,
                        is_featured: true,
                        stock_quantity: 50,
                        low_stock_threshold: 10,
                        image: 'https://via.placeholder.com/300x200',
                        inStock: true,
                        features: [
                            {
                                name: 'Easy assembly',
                                id: '',
                                description: ''
                            },
                            {
                                name: 'Educational',
                                id: '',
                                description: ''
                            },
                            {
                                name: 'Complete parts',
                                id: '',
                                description: ''
                            }
                        ]
                    }
                ]);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStoreItems(setStoreItems);
    }, []);

    // Get unique categories from store items
    const categories = Array.from(new Set(storeItems.map(item => item.category)));

    // Filter items based on search and filters
    const filteredItems = storeItems.filter((item) => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             item.short_description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             item.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;

        const matchesPriceRange = selectedPriceRange === 'all' ||
            (selectedPriceRange === 'under-50' && item.price < 50) ||
            (selectedPriceRange === '50-100' && item.price >= 50 && item.price <= 100) ||
            (selectedPriceRange === '100-500' && item.price >= 100 && item.price <= 500) ||
            (selectedPriceRange === 'over-500' && item.price > 500);

        const matchesStock = !showOnlyInStock || (item.stock_quantity > 0);

        const matchesFeatured = !showOnlyFeatured || item.is_featured;

        return matchesSearch && matchesCategory && matchesPriceRange && matchesStock && matchesFeatured;
    });

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent mx-auto"></div>
                    <p className="mt-2 text-slate-400">Loading store items...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="text-center">
                    <FaStore className="h-16 w-16 text-slate-600 mx-auto" />
                    <h3 className="mt-4 text-lg font-semibold text-white">Error loading store</h3>
                    <p className="mt-2 text-slate-400">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {/* Top Bar - Filtering and Searching */}
            <div className="border-b border-slate-700/50 bg-slate-800/60 p-6 backdrop-blur-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-1 flex-wrap items-center gap-4">
                        {/* Search Bar */}
                        <div className="relative max-w-md flex-1">
                            <FaSearch className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search store items..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-10 py-2 text-white placeholder-slate-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 focus:outline-none"
                            />
                        </div>

                        {/* Category Filter */}
                        <div className="relative">
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="appearance-none rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 pr-8 text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 focus:outline-none"
                            >
                                <option value="all">All Categories</option>
                                {categories.map((category) => (
                                    <option key={category} value={category}>
                                        {category}
                                    </option>
                                ))}
                            </select>
                            <HiChevronDown className="pointer-events-none absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>

                        {/* Price Range Filter */}
                        <div className="relative">
                            <select
                                value={selectedPriceRange}
                                onChange={(e) => setSelectedPriceRange(e.target.value)}
                                className="appearance-none rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 pr-8 text-white focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 focus:outline-none"
                            >
                                <option value="all">All Prices</option>
                                <option value="under-50">Under $50</option>
                                <option value="50-100">$50 - $100</option>
                                <option value="100-500">$100 - $500</option>
                                <option value="over-500">Over $500</option>
                            </select>
                            <HiChevronDown className="pointer-events-none absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>

                        {/* Stock Filter */}
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                                type="checkbox"
                                checked={showOnlyInStock}
                                onChange={(e) => setShowOnlyInStock(e.target.checked)}
                                className="rounded border-slate-600 bg-slate-700 text-orange-500 focus:ring-orange-500/20"
                            />
                            In Stock Only
                        </label>

                        {/* Featured Filter */}
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                                type="checkbox"
                                checked={showOnlyFeatured}
                                onChange={(e) => setShowOnlyFeatured(e.target.checked)}
                                className="rounded border-slate-600 bg-slate-700 text-orange-500 focus:ring-orange-500/20"
                            />
                            Featured Only
                        </label>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-sm text-slate-400">
                            Showing {filteredItems.length} of {storeItems.length} items
                        </div>
                        
                        {/* View Cart Button */}
                        <button
                            onClick={() => router.push('/app/cart')}
                            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-4 py-2 font-semibold text-white transition-all duration-200 hover:from-green-600 hover:to-green-700 shadow-lg hover:shadow-green-500/25"
                        >
                            <FaShoppingCart className="h-4 w-4" />
                            View Cart
                        </button>
                    </div>
                </div>
            </div>

            {/* Store Items Grid */}
            <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredItems.map((item) => (
                        <StoreCard key={item.id} item={item} />
                    ))}
                </div>

                {/* Empty State */}
                {filteredItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                        <FaStore className="h-16 w-16 text-slate-600" />
                        <h3 className="mt-4 text-lg font-semibold text-white">No items found</h3>
                        <p className="mt-2 text-slate-400">Try adjusting your search or filters</p>
                    </div>
                )}
            </div>
        </div>
    );
};
