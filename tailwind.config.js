/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'wolf-dark': '#0f172a',
                'wolf-accent': '#3b82f6',
                'phase-night': '#020617',
                'phase-day': '#f0f9ff',
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
                'fly-in-top': 'flyInTop 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) backwards',
                'fly-in-bottom': 'flyInBottom 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) backwards',
            },
            keyframes: {
                fadeInUp: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                flyInTop: {
                    '0%': { opacity: '0', transform: 'translateY(40vh) scale(0.5)' },
                    '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                },
                flyInBottom: {
                    '0%': { opacity: '0', transform: 'translateY(-40vh) scale(0.5)' },
                    '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                }
            }
        },
    },
    plugins: [],
}
