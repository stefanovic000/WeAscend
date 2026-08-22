// mongodb-connection-string-url only consumes URL from whatwg-url.
// Workers already provide the standards-compliant global implementations,
// so avoid pulling the Node/CommonJS-only tr46 and punycode chain into workerd.
export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;
