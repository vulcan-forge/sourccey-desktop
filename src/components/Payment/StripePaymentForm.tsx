"use client";

import { useEffect, useState } from 'react';
import {
    PaymentElement,
    useStripe,
    useElements,
    Elements
} from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { FaCreditCard, FaLock } from 'react-icons/fa';

// Initialize Stripe with your publishable key
const stripePromise = loadStripe('pk_test_51S5razQ2Ow8xRF6dHWJAp1tkNeartsWRbfK8fDM2rin9XpMoDlJP4nf5MCGlA0BVREzcaboyz7dboG4MsAOjTD5k00TrT4Ybym');

// Options for PaymentElement – collect name/email so confirmPayment has billing details
const paymentMethodOptions = {
    layout: 'tabs' as const,
    paymentMethodOrder: ['card'],
    fields: {
        billingDetails: {
            name: 'auto' as const,   // required by Stripe when not provided in confirmPayment
            email: 'auto' as const,  // collect email in the element
            phone: 'auto' as const,
            address: {
                country: 'auto' as const,
                postalCode: 'auto' as const,
            },
        },
    },
    wallets: {
        applePay: 'never' as const,
        googlePay: 'never' as const,
    },
};

interface StripePaymentFormProps {
    clientSecret: string;
    onPaymentSuccess: (paymentIntent: any) => void;
    onPaymentError: (error: any) => void;
    amount: number;
    currency: string;
}

export const StripePaymentForm: React.FC<StripePaymentFormProps> = ({
    clientSecret,
    onPaymentSuccess,
    onPaymentError,
    amount,
    currency
}) => {
    const stripe = useStripe();
    const elements = useElements();
    const [isProcessing, setIsProcessing] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [isPaymentMethodComplete, setIsPaymentMethodComplete] = useState(false);

    // Handle PaymentElement events to track completion status
    const handlePaymentElementChange = (event: any) => {
        setIsPaymentMethodComplete(event.complete);
        if (event.error) {
            setMessage(event.error.message);
        } else {
            setMessage(null);
        }

        // Debug: Log billing details collection
        if (event.complete) {
            console.info('✅ PaymentElement completed - billing details should be collected');
        }
    };

    // On mount or when Stripe is ready, retrieve the latest PaymentIntent status.
    useEffect(() => {
        const checkPaymentIntent = async () => {
            if (!stripe) return;
            const urlSecret = typeof window !== 'undefined'
                ? new URLSearchParams(window.location.search).get('payment_intent_client_secret')
                : null;
            const secretToCheck = urlSecret || clientSecret;
            if (!secretToCheck) return;
            try {
                const { paymentIntent } = await stripe.retrievePaymentIntent(secretToCheck);
                if (!paymentIntent) return;

                if (paymentIntent.status === 'succeeded') {
                    setMessage('Payment successful! Your card has been saved for future purchases.');
                    onPaymentSuccess(paymentIntent);
                } else if (paymentIntent.status === 'requires_capture') {
                    // Authorized but awaiting capture on the server (manual capture flow)
                    setMessage('Payment authorized. Awaiting capture by the store.');
                    onPaymentSuccess(paymentIntent);
                } else if (paymentIntent.status === 'processing') {
                    setMessage('Processing payment...');
                } else if (paymentIntent.status === 'requires_action') {
                    setMessage('Additional authentication required. Please complete the challenge.');
                } else if (paymentIntent.status === 'requires_payment_method') {
                    setMessage('Payment method required. Please re-enter your details.');
                }
            } catch (e) {
                // Silent – this is a best-effort check
            }
        };
        checkPaymentIntent();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stripe, clientSecret]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!stripe || !elements) {
            setMessage('Stripe is not properly initialized.');
            return;
        }

        setIsProcessing(true);
        setMessage('Validating payment method...');
        console.info('🔎 confirmPayment starting with clientSecret:', clientSecret?.slice(0, 12) + '…');

        try {
            // Check if PaymentElement is ready with user input
            const { error: submitError } = await elements.submit();
            if (submitError) {
                console.error('Payment method validation failed:', submitError);
                setMessage(submitError.message || 'Please complete your payment information.');
                setIsProcessing(false);
                return;
            }

            setMessage('Processing payment...');

            // Debug: Check if PaymentElement has collected billing details
            console.info('🔍 PaymentElement billing details collection enabled');

            // Prepare confirmPayment parameters
            const confirmParams = {
                elements,
                confirmParams: {
                    return_url: `${window.location.origin}/checkout/success`,
                },
                redirect: 'if_required' as const, // Don't redirect, handle in component
                clientSecret
            };

            console.log('🚀 2. SENDING TO STRIPE - confirmPayment parameters:', {
                confirmParams: confirmParams.confirmParams,
                redirect: confirmParams.redirect,
                clientSecret: confirmParams.clientSecret ? `${confirmParams.clientSecret.substring(0, 50)}...` : null,
                elements_present: !!confirmParams.elements,
                paymentElement_config: {
                    billingDetails: {
                        name: paymentMethodOptions.fields.billingDetails.name,
                        email: paymentMethodOptions.fields.billingDetails.email,
                        phone: paymentMethodOptions.fields.billingDetails.phone,
                        address: paymentMethodOptions.fields.billingDetails.address
                    }
                }
            });

            // Confirm payment with the PaymentIntent created by backend
            // This charges the customer AND saves their card for future use
            const { error, paymentIntent } = await stripe.confirmPayment(confirmParams);

            console.log('📨 2. STRIPE RESPONSE - confirmPayment result:', {
                error: error ? {
                    type: (error as any).type,
                    code: (error as any).code,
                    message: error.message,
                    full_error: error
                } : null,
                paymentIntent: paymentIntent ? {
                    id: (paymentIntent as any).id,
                    status: (paymentIntent as any).status,
                    amount: (paymentIntent as any).amount,
                    currency: (paymentIntent as any).currency,
                    receipt_email: (paymentIntent as any).receipt_email,
                    payment_method: (paymentIntent as any).payment_method,
                    client_secret: (paymentIntent as any).client_secret ? `${(paymentIntent as any).client_secret.substring(0, 50)}...` : null,
                    full_response: paymentIntent
                } : null
            });

            if (error) {
                console.error('Payment failed:', error);
                setMessage(error.message || 'Payment failed');
                onPaymentError(error);
            } else if (paymentIntent && (paymentIntent as any).status === 'succeeded') {
                console.log('Payment successful and card saved:', paymentIntent);
                setMessage('Payment successful! Your card has been saved for future purchases.');
                onPaymentSuccess(paymentIntent);
            } else if (paymentIntent && (paymentIntent as any).status === 'requires_capture') {
                // Manual capture flow – treat as success on the client; backend will capture
                console.log('Payment authorized, awaiting capture:', paymentIntent);
                setMessage('Payment authorized. Awaiting capture by the store.');
                onPaymentSuccess(paymentIntent);
            } else if (paymentIntent && (paymentIntent as any).status === 'processing') {
                setMessage('Processing payment...');
            } else {
                setMessage('Payment is incomplete. Please try again.');
            }
        } catch (err) {
            console.error('Payment error:', err);
            setMessage('An unexpected error occurred.');
            onPaymentError(err);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-center mb-6">
                <FaCreditCard className="h-8 w-8 text-blue-600 mr-2" />
                <h2 className="text-xl font-bold text-gray-900">Complete Payment</h2>
            </div>

            <div className="mb-4 text-center">
                <div className="text-2xl font-bold text-gray-900 mb-2">
                    {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: currency.toUpperCase(),
                    }).format(amount)}
                </div>
                <div className="text-sm text-gray-600 mb-2">
                    Pay now and save your card for future purchases
                </div>
                <div className="text-sm text-blue-600 font-medium">
                    {isPaymentMethodComplete ? '✓ Ready to pay and save card' : 'Enter your card details below'}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <PaymentElement
                        options={paymentMethodOptions}
                        onChange={handlePaymentElementChange}
                        className="w-full"
                    />
                </div>

                <div className="flex items-center justify-center text-sm text-gray-600 mb-4">
                    <FaLock className="h-4 w-4 mr-2" />
                    <span>Your payment information is secure and encrypted</span>
                </div>

                {message && (
                    <div className={`p-3 rounded-md text-sm ${
                        message.includes('succeeded')
                            ? 'bg-green-50 text-green-800 border border-green-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                    }`}>
                        {message}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={!stripe || !elements || isProcessing}
                    className={`w-full flex items-center justify-center px-4 py-3 rounded-lg font-semibold text-white transition-all duration-200 ${
                        isProcessing || !stripe || !elements
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
                    }`}
                >
                    {isProcessing ? (
                        <>
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                            Processing Payment...
                        </>
                    ) : (
                        <>
                            <FaCreditCard className="h-5 w-5 mr-2" />
                            Pay {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: currency.toUpperCase(),
                            }).format(amount)}
                        </>
                    )}
                </button>
            </form>

            <div className="mt-4 text-xs text-gray-500 text-center">
                Powered by <span className="font-semibold">Stripe</span> • PCI DSS compliant
            </div>
        </div>
    );
};

// Wrapper component that provides Stripe context
interface StripePaymentWrapperProps {
    clientSecret: string;
    onPaymentSuccess: (paymentIntent: any) => void;
    onPaymentError: (error: any) => void;
    amount: number;
    currency: string;
}

export const StripePaymentWrapper: React.FC<StripePaymentWrapperProps> = ({
    clientSecret,
    onPaymentSuccess,
    onPaymentError,
    amount,
    currency
}) => {
    const options = {
        clientSecret: clientSecret,
        appearance: {
            theme: 'stripe' as const,
            variables: {
                colorPrimary: '#3b82f6', // blue-500
                colorBackground: '#ffffff',
                colorText: '#1f2937', // gray-800
                colorDanger: '#ef4444', // red-500
                fontFamily: 'system-ui, -apple-system, sans-serif',
                spacingUnit: '4px',
                borderRadius: '6px',
            },
        },
    };

    return (
        <Elements stripe={stripePromise} options={options}>
            <StripePaymentForm
                clientSecret={clientSecret}
                onPaymentSuccess={onPaymentSuccess}
                onPaymentError={onPaymentError}
                amount={amount}
                currency={currency}
            />
        </Elements>
    );
};
