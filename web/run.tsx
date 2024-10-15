import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { App } from './App';

declare global {
    interface Window {
        reactRoot?: Root;
    }
}

const rootNode = () => {
    if (window.reactRoot) return window.reactRoot;
    const node = document.createElement('div');
    document.body.append(node);
    return (window.reactRoot = createRoot(node));
};

rootNode().render(<App />);
console.log('hi');
