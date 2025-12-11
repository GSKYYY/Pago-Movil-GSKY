import React from 'react';

interface ToastProps {
    message: string;
    type: 'success' | 'error' | 'info';
    show: boolean;
}

export const Toast: React.FC<ToastProps> = ({ message, type, show }) => {
    let bgColor = 'bg-text';
    let icon = 'ℹ';

    if (type === 'success') {
        bgColor = 'bg-green-500';
        icon = '✓';
    } else if (type === 'error') {
        bgColor = 'bg-red-500';
        icon = '✕';
    }

    return (
        <div 
            className={`fixed bottom-[30px] left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-7 py-3.5 rounded-full text-white text-sm font-medium shadow-xl transition-all duration-300 z-50
            ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-[100px] pointer-events-none'}
            ${bgColor}`}
        >
            <span className="text-lg leading-none">{icon}</span>
            <span>{message}</span>
        </div>
    );
};