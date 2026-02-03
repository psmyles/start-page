// CHANGE THIS if your repo is named differently
const GITHUB_BASE_URL = 'https://psmyles.github.io/start-page/'; 
const CACHE_KEY = 'startpage_html_cache_v1';

// 1. Helper to fix relative URLs in the raw HTML
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

    // Update all relative links to point to GitHub
    doc.querySelectorAll('link[href]').forEach(el => el.href = fixUrl(el.getAttribute('href')));
    doc.querySelectorAll('script[src]').forEach(el => el.src = fixUrl(el.getAttribute('src')));
    doc.querySelectorAll('img[src]').forEach(el => el.src = fixUrl(el.getAttribute('src')));

    return doc.documentElement.innerHTML;
}

// 2. Function to Inject HTML into the page
function injectContent(innerHtmlContent) {
    document.documentElement.innerHTML = innerHtmlContent;

    // Re-activate scripts (innerHTML doesn't run them automatically)
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
}

async function loadStartpage() {
    // --- PHASE 1: CACHE FIRST (Instant Load) ---
    const cachedHTML = localStorage.getItem(CACHE_KEY);
    if (cachedHTML) {
        console.log("Loading from Local Storage Cache...");
        injectContent(cachedHTML);
    }

    // --- PHASE 2: NETWORK UPDATE (Background Fetch) ---
    try {
        console.log("Checking for updates from GitHub...");
        const response = await fetch(GITHUB_BASE_URL + 'index.html');
        
        if (!response.ok) throw new Error('Network response was not ok');
        
        const rawText = await response.text();
        const processedHTML = processHTML(rawText);

        // Save the new version for NEXT time
        localStorage.setItem(CACHE_KEY, processedHTML);
        console.log("Cache updated successfully.");

        // If we didn't have a cache, load the live version now
        if (!cachedHTML) {
            injectContent(processedHTML);
        } else if (cachedHTML !== processedHTML) {
            console.log("New version available (will load on next refresh)");
        }

    } catch (error) {
        console.error('Network fetch failed:', error);
        if (!cachedHTML) {
            document.body.innerHTML = `
                <div style="color:#666; font-family:sans-serif; text-align:center; margin-top:20%;">
                    <h1>Offline</h1>
                    <p>Could not load startpage and no cache available.</p>
                </div>
            `;
        }
    }
}

loadStartpage();