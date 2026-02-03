// CHANGE THIS if your repo is named differently
const GITHUB_BASE_URL = 'https://psmyles.github.io/start-page/'; 
const CACHE_KEY = 'startpage_html_cache_v1';

// 1. Helper to fix relative URLs and setup the "No Flash" styles
function processHTML(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    const fixUrl = (url) => {
        if (!url) return url;
        if (url.startsWith('http') || url.startsWith('//') || url.startsWith('data:')) {
            return url;
        }
        return GITHUB_BASE_URL + url;
    };

    // A. Fix all relative links
    doc.querySelectorAll('link[href]').forEach(el => el.href = fixUrl(el.getAttribute('href')));
    doc.querySelectorAll('script[src]').forEach(el => el.src = fixUrl(el.getAttribute('src')));
    doc.querySelectorAll('img[src]').forEach(el => el.src = fixUrl(el.getAttribute('src')));

    // B. "No Flash" Logic - Step 1: Add the class
    doc.body.classList.add('is-loading');

    // (Note: We removed the inline 'onload' attribute here to fix the CSP error)

    // C. Inject Critical CSS
    const criticalStyle = doc.createElement('style');
    criticalStyle.textContent = `
        /* Always keep the background black */
        html { background-color: #000000 !important; }
        
        /* Hide the body content completely while loading */
        body.is-loading { 
            opacity: 0 !important; 
            visibility: hidden !important; 
        }

        /* Fade in when ready */
        body { 
            opacity: 1; 
            transition: opacity 0.3s ease-in; 
            background-color: #000000; 
        }
    `;
    doc.head.appendChild(criticalStyle);

    return doc.documentElement.innerHTML;
}

// 2. Function to Inject HTML and attach listeners safely
function injectContent(innerHtmlContent) {
    document.documentElement.innerHTML = innerHtmlContent;

    // --- A. Re-activate scripts ---
    const scripts = document.querySelectorAll('script');
    scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        if (oldScript.src) {
            newScript.src = oldScript.src;
        } else {
            newScript.textContent = oldScript.textContent;
        }
        document.body.appendChild(newScript);
    });

    // --- B. "No Flash" Logic - Step 2: Safe Event Listener ---
    // Instead of using onload="..." in HTML, we attach it here in JS
    const removeLoading = () => {
        document.body.classList.remove('is-loading');
    };

    const cssLink = document.querySelector('link[rel="stylesheet"]');
    if (cssLink) {
        // This is safe because it's inside the extension's trusted JS file
        cssLink.addEventListener('load', removeLoading);
        cssLink.addEventListener('error', removeLoading); // Fallback if CSS fails
        
        // Safety Timeout: Force show content after 1s if network hangs
        setTimeout(removeLoading, 1000);
    } else {
        // If no CSS link found, show immediately
        removeLoading();
    }
}

async function loadStartpage() {
    // --- PHASE 1: CACHE FIRST ---
    const cachedHTML = localStorage.getItem(CACHE_KEY);
    if (cachedHTML) {
        console.log("Loading from Local Storage Cache...");
        injectContent(cachedHTML);
    }

    // --- PHASE 2: NETWORK UPDATE ---
    try {
        console.log("Checking for updates from GitHub...");
        const response = await fetch(GITHUB_BASE_URL + 'index.html');
        if (!response.ok) throw new Error('Network response was not ok');
        
        const rawText = await response.text();
        const processedHTML = processHTML(rawText);

        localStorage.setItem(CACHE_KEY, processedHTML);
        console.log("Cache updated successfully.");

        if (!cachedHTML) {
            injectContent(processedHTML);
        }

    } catch (error) {
        console.error('Network fetch failed:', error);
        if (!cachedHTML) {
            document.body.innerHTML = `
                <div style="background:#000; color:#666; font-family:sans-serif; text-align:center; padding-top:20vh; height:100vh;">
                    <h1>Offline</h1>
                    <p>Could not load startpage.</p>
                </div>
            `;
        }
    }
}

loadStartpage();