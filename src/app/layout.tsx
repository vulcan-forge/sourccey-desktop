import Provider from '@/app/provider';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Sourccey - The #1 Hub of Robotics Control',
    description: 'Sourccey is the #1 hub of robotics control. Share, test, and control your open source robots to find out which are the best',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                <Provider>
                    {children}
                </Provider>
            </body>
        </html>
    );
}
