'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FaCheckCircle, FaShoppingCart, FaArrowLeft } from 'react-icons/fa';
import Link from 'next/link';

function CheckoutSuccessContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

    useEffect(() => {
        const paymentIntent = searchParams.get('payment_intent');
        const paymentIntentClientSecret = searchParams.get('payment_intent_client_secret');

        if (paymentIntent) {
            setPaymentIntentId(paymentIntent);
        }

        // Redirect to home if no payment intent (shouldn't happen in normal flow)
        if (!paymentIntent && !paymentIntentClientSecret) {
            setTimeout(() => {
                router.push('/');
            }, 3000);
        }
    }, [searchParams, router]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                        <FaCheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                </div>

                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    Payment Successful!
                </h1>

                <p className="text-gray-600 mb-6">
                    Thank you for your purchase. Your order has been processed successfully.
                </p>

                {paymentIntentId && (
                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                        <p className="text-sm text-gray-600 mb-1">Payment ID</p>
                        <p className="font-mono text-sm text-gray-900 break-all">
                            {paymentIntentId}
                        </p>
                    </div>
                )}

                <div className="space-y-3">
                    <Link
                        href="/app/store"
                        className="w-full flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors duration-200"
                    >
                        <FaShoppingCart className="w-5 h-5 mr-2" />
                        Continue Shopping
                    </Link>

                    <Link
                        href="/app/cart"
                        className="w-full flex items-center justify-center px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors duration-200"
                    >
                        <FaArrowLeft className="w-4 h-4 mr-2" />
                        Back to Cart
                    </Link>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-200">
                    <p className="text-sm text-gray-500">
                        A confirmation email has been sent to your email address.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function CheckoutSuccessPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        }>
            <CheckoutSuccessContent />
        </Suspense>
    );
}
