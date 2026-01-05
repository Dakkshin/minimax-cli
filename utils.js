// utils.js - Helper utility functions

function greet(name) {
    return `Hello, ${name}!`;
}

function formatDate(date) {
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    };
    return date.toLocaleDateString('en-US', options);
}

function isEven(number) {
    return number % 2 === 0;
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Export all utility functions
module.exports = { 
    greet, 
    formatDate, 
    isEven, 
    capitalize 
};
