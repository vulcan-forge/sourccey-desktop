import { Spinner } from '@/components/Elements/Spinner';
import { signIn, useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FaGithub, FaGoogle } from 'react-icons/fa';

export default function LoginSection({ isSignUp = false }) {
    const router = useRouter();
    const { status } = useSession();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isEmailSent, setIsEmailSent] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [emailError, setEmailError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [attemptedSubmit, setAttemptedSubmit] = useState(false);

    //---------------------------------------------------------------------------------------------------//
    // Password Functions
    //---------------------------------------------------------------------------------------------------//
    const validatePassword = (value: string) => {
        if (value.length < 8) {
            setPasswordError('Password must be at least 8 characters long');
        } else {
            setPasswordError('');
        }
    };

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newPassword = e.target.value;
        setPassword(newPassword);
        if (attemptedSubmit) {
            validatePassword(newPassword);
        }
    };
    //---------------------------------------------------------------------------------------------------//

    //---------------------------------------------------------------------------------------------------//
    // Email Functions
    //---------------------------------------------------------------------------------------------------//
    const validateEmail = (value: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            setEmailError('Please enter a valid email address');
            return false;
        } else {
            setEmailError('');
            return true;
        }
    };

    const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newEmail = e.target.value;
        setEmail(newEmail);
        if (attemptedSubmit) {
            validateEmail(newEmail);
        }
    };
    //---------------------------------------------------------------------------------------------------//

    //---------------------------------------------------------------------------------------------------//
    // Submit Functions
    //---------------------------------------------------------------------------------------------------//
    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const result = await signIn('credentials', {
                email,
                password,
                redirect: false,
            });

            if (result?.ok) {
                if (isSignUp) {
                    setIsEmailSent(true); // Show confirmation message for signup
                } else {
                    router.push('/'); // Redirect on successful login
                }
            } else {
                // Handle specific error messages
                if (result?.error === 'CredentialsSignin') {
                    setPasswordError('Invalid email or password');
                } else {
                    setPasswordError(result?.error || 'Login failed. Please try again.');
                }
            }
        } catch (error) {
            console.error('Login error:', error);
            setPasswordError('An unexpected error occurred. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setAttemptedSubmit(true);

        const isEmailValid = validateEmail(email);
        validatePassword(password);

        if (isEmailValid && password.length >= 8) {
            handleEmailLogin(e);
        }
    };
    //---------------------------------------------------------------------------------------------------//

    //---------------------------------------------------------------------------------------------------//
    // Login Functions
    //---------------------------------------------------------------------------------------------------//
    const handleLogin = async (provider: string) => {
        await signIn(provider, { redirect: true, callbackUrl: '/' });
    };
    //---------------------------------------------------------------------------------------------------//

    // useEffect(() => {
    //     if (status === 'authenticated') {
    //         router.push('/dashboard/robots'); // Redirect to home if the user is logged in
    //     }
    // }, [status, router]);

    if (status === 'authenticated') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 sm:px-0">
                <Spinner />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-8 sm:px-0">
            <div className="shadow-full-lg -mt-36 w-full max-w-md rounded-lg border border-slate-700 bg-slate-800/80 p-8 backdrop-blur-sm">
                <h2 className="mb-6 bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-center text-2xl font-bold text-transparent">
                    {isSignUp ? 'Sign Up' : 'Login'} to Sourccey
                </h2>
                {isEmailSent && (
                    <div className="mb-4 text-center text-green-400">
                        A confirmation email has been sent to {email}. Please check your inbox.
                    </div>
                )}
                <form onSubmit={handleSubmit} className="mb-4 space-y-4">
                    <div>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={handleEmailChange}
                            className={`w-full rounded border bg-slate-900 p-2 text-slate-200 focus:border-orange-400 focus:outline-none ${
                                attemptedSubmit && emailError ? 'border-red-500' : 'border-slate-600'
                            }`}
                            required
                        />
                        {attemptedSubmit && emailError && <p className="mt-1 text-sm text-red-400">{emailError}</p>}
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={handlePasswordChange}
                            className={`w-full rounded border bg-slate-900 p-2 text-slate-200 focus:border-orange-400 focus:outline-none ${
                                attemptedSubmit && passwordError ? 'border-red-500' : 'border-slate-600'
                            }`}
                            required
                        />
                        {attemptedSubmit && passwordError && <p className="mt-1 text-sm text-red-400">{passwordError}</p>}
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full cursor-pointer rounded bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 p-2 text-white transition-all duration-200 hover:from-red-600 hover:via-orange-600 hover:to-yellow-600 disabled:opacity-70"
                    >
                        {isLoading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Login'}
                    </button>
                </form>
                <LoginNote isSignUp={isSignUp} />
                <div className="relative mb-4">
                    <hr className="my-6 border-slate-600" />
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 px-2 text-xs text-slate-400">
                        OR
                    </span>
                </div>
                <div className="space-y-2">
                    <button
                        onClick={() => handleLogin('google')}
                        className="flex w-full cursor-pointer items-center justify-center rounded bg-gradient-to-r from-red-500 to-orange-500 p-2 text-white transition-all duration-200 hover:from-red-600 hover:to-orange-600"
                    >
                        <FaGoogle className="mr-2" /> {isSignUp ? 'Sign Up' : 'Login'} with Google
                    </button>
                    <button
                        onClick={() => handleLogin('github')}
                        className="flex w-full cursor-pointer items-center justify-center rounded bg-gradient-to-r from-slate-700 to-slate-600 p-2 text-white transition-all duration-200 hover:from-slate-600 hover:to-slate-500"
                    >
                        <FaGithub className="mr-2" /> {isSignUp ? 'Sign Up' : 'Login'} with GitHub
                    </button>
                </div>
            </div>
        </div>
    );
}

export const LoginNote = ({ isSignUp = false }) => {
    return (
        <>
            <div className="flex items-center justify-center py-1">
                {!isSignUp ? (
                    <div className="flex justify-center gap-2 text-center text-sm text-slate-300">
                        <div>New To Sourccey?</div>
                        <Link href="/signup" className="text-orange-400 hover:text-yellow-400 hover:underline">
                            Sign Up
                        </Link>
                    </div>
                ) : (
                    <div className="flex justify-center gap-2 text-center text-sm text-slate-300">
                        <div>Already have an account?</div>
                        <Link href="/login" className="text-orange-400 hover:text-yellow-400 hover:underline">
                            Login
                        </Link>
                    </div>
                )}

                {!isSignUp && (
                    <>
                        <div className="flex-1"></div>
                        <div className="flex justify-center text-center text-sm text-slate-300">
                            <Link href="/forgot-password" className="text-orange-400 hover:text-yellow-400 hover:underline">
                                Forgot Password?
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </>
    );
};
