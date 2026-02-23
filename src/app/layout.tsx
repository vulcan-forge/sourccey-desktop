import Provider from '@/app/provider';
import { MainLayout } from '@/components/Layouts/Main/MainLayout';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Vulcan Robotics - The #1 Hub of Robotics Control',
    description: 'Vulcan Robotics is the #1 hub of robotics control. Command and control your fleet of Sourccey robots.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                <Provider>
                    <MainLayout>{children}</MainLayout>
                </Provider>
            </body>
        </html>
    );
}
