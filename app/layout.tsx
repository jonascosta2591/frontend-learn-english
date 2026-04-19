import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import { AuthProvider } from "./context/AuthContext";
import AuthGuard from "./components/AuthGuard";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ReadXP — English Comprehension",
  description: "Read English texts and earn XP by explaining what you understood",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <AuthGuard>
            <Header />
            {children}
          </AuthGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
