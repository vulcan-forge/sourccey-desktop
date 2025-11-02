// DESKTOP SOFTWARE WILL RUN ON THE DESKTOP SO EVERYTHING WILL BE CLIENT SIDE
// THEREFORE WE MUST HAVE OUR C# BACKEND HANDLE THE AUTHENTICATION

// import { mutateLogin } from '@/api/GraphQL/Account/Mutations/LoginMutation';
// import type { LoginInput } from '@/api/GraphQL/Account/Types/Login/LoginInput';
// import { queryProfile } from '@/api/GraphQL/Profile/Query';
// import { decodeJwt, jwtVerify, SignJWT } from 'jose';
// import NextAuth from 'next-auth';
// import Credentials from 'next-auth/providers/credentials';
// import GitHub from 'next-auth/providers/github';
// import Google from 'next-auth/providers/google';

// export const { auth, handlers, signIn, signOut } = NextAuth(() => {
//     return {
//         providers: [
//             Credentials({
//                 credentials: {
//                     email: { label: 'Email' },
//                     password: { label: 'Password', type: 'password' },
//                 },
//                 async authorize(credentials) {
//                     const input: LoginInput = {
//                         email: credentials.email as string,
//                         password: credentials.password as string,
//                         name: credentials.email as string,
//                         image: null,

//                         provider: getProvider('credentials'),
//                         providerId: crypto.randomUUID(),
//                     };

//                     const loginPayload = await mutateLogin(input);
//                     const account = loginPayload.account;
//                     return account;
//                 },
//             }),
//             GitHub,
//             Google,
//         ],
//         session: {
//             strategy: 'jwt',
//         },
//         jwt: {
//             encode: async ({ token }) => {
//                 const key: any = Buffer.from(process.env.AUTH_SECRET ?? '', 'base64');
//                 const result = await new SignJWT(token).setProtectedHeader({ alg: 'HS512' }).setIssuedAt().setExpirationTime('30d').sign(key);
//                 return result;
//             },
//             decode: async ({ token }) => {
//                 const key: any = Buffer.from(process.env.AUTH_SECRET ?? '', 'base64');
//                 const result = await jwtVerify(token ?? '', key, {
//                     algorithms: ['HS512'],
//                 });
//                 return result.payload;
//             },
//         },
//         callbacks: {
//             async signIn({ user, account }: any) {
//                 try {
//                     // Force clear any existing session
//                     await signOut({ redirect: false });

//                     if (account?.provider === 'github' || account?.provider === 'google') {
//                         const input: LoginInput = {
//                             email: user.email,
//                             name: user.name,
//                             image: user.image,
//                             provider: getProvider(account.provider),
//                             providerId: account.providerAccountId,
//                             password: null,
//                         };

//                         const loginPayload = await mutateLogin(input);
//                         if (!loginPayload?.account) {
//                             console.error('Login failed - no account returned');
//                             return false;
//                         }
//                     }
//                     return true;
//                 } catch (error) {
//                     console.error('Error signing in', error);
//                     return false;
//                 }
//             },
//             jwt({ token, account }) {
//                 const id_token: string = account?.id_token ?? '';
//                 let decoded: any = '';
//                 if (!!id_token) {
//                     decoded = decodeJwt(id_token);
//                 }

//                 const iss = decoded.iss;
//                 if (!!iss) {
//                     token = { ...token, iss };
//                 }

//                 const aud = decoded.aud;
//                 if (!!aud) {
//                     token = { ...token, aud };
//                 }

//                 return token;
//             },
//             // Session Functionality: https://authjs.dev/guides/extending-the-session
//             session: async ({ session }: any) => {
//                 const email = session.user.email;
//                 const profile = await queryProfile(null, null, email);

//                 // Add profile to the session
//                 session.user = { ...session.user, profile: { ...profile } };
//                 return session;
//             },
//         },
//         trustHost: true,
//         cookies: {
//             sessionToken: {
//                 name: 'authjs.session-token',
//                 options: {
//                     httpOnly: true,
//                     path: '/',
//                     sameSite: process.env.NEXT_PUBLIC_ENVIRONMENT === 'local' ? 'none' : 'lax',
//                     secure: true,
//                     domain: getCookieDomain(),
//                     maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
//                 },
//             },
//             callbackUrl: {
//                 name: 'authjs.callback-url',
//                 options: {
//                     httpOnly: true,
//                     path: '/',
//                     sameSite: process.env.NEXT_PUBLIC_ENVIRONMENT === 'local' ? 'none' : 'lax',
//                     secure: true,
//                     domain: getCookieDomain(),
//                 },
//             },
//             csrfToken: {
//                 name: 'authjs.csrf-token',
//                 options: {
//                     httpOnly: true,
//                     path: '/',
//                     sameSite: process.env.NEXT_PUBLIC_ENVIRONMENT === 'local' ? 'none' : 'lax',
//                     secure: true,
//                     domain: getCookieDomain(),
//                 },
//             },
//         },
//         events: {
//             async signOut() {
//                 // Clear all auth-related cookies
//                 const cookieNames = [
//                     'authjs.session-token',
//                     'authjs.callback-url',
//                     'authjs.csrf-token',
//                     'next-auth.session-token',
//                     'next-auth.callback-url',
//                     'next-auth.csrf-token',
//                 ];

//                 // Set each cookie to expire immediately
//                 if (typeof window !== 'undefined') {
//                     cookieNames.forEach((name) => {
//                         document.cookie = `${name}=; path=/; domain=${getCookieDomain()}; expires=Thu, 01 Jan 1970 00:00:00 GMT; secure; samesite=lax`;
//                     });
//                 }
//             },
//         },
//     };
// });

// export enum AuthProvider {
//     Credentials = 0,
//     Google = 1,
//     GitHub = 2,
// }

// export const getProvider = (provider: string): AuthProvider => {
//     switch (provider.toLowerCase()) {
//         case 'google':
//             return AuthProvider.Google;
//         case 'github':
//             return AuthProvider.GitHub;
//         case 'credentials':
//         default:
//             return AuthProvider.Credentials;
//     }
// };

// export const getSessionToken = (response: Response) => {
//     const sessionTokenCookie: any = response.headers.get('set-cookie');
//     if (sessionTokenCookie) {
//         // Split the cookie string to extract just the token part
//         const sessionToken = sessionTokenCookie.split(';')[0].split('=')[1];
//         return sessionToken;
//     }

//     return null;
// };

// // This is required for the auth cookies to be set correctly
// const getCookieDomain = () => {
//     switch (process.env.NEXT_PUBLIC_ENVIRONMENT) {
//         case 'local':
//             return undefined;
//         case 'staging':
//         case 'production':
//             // Check which domain we're on
//             if (typeof window !== 'undefined') {
//                 const hostname = window.location.hostname;
//                 if (hostname.includes('sourcey.com')) {
//                     return '.sourcey.com';
//                 }
//                 return '.sourcey.com';
//             }
//             return '.sourcey.com';
//         default:
//             return undefined;
//     }
// };
