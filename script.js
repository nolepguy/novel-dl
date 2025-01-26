async function fetchNovelContent(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const content = doc.querySelector('#novel_content');

        if (!content) {
            throw new Error('Novel content element not found');
        }

        return cleanText(content.innerHTML);
    } catch (error) {
        console.error(`Failed to fetch content: ${error.message}`);
        return null;
    }
}

function unescapeHTML(text) {
    const entities = {
        '&lt;': '<', '&gt;': '>', '&amp;': '&',
        '&quot;': '"', '&apos;': "'", '&#039;': "'",
        '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—',
        '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”'
    };

    return text.replace(/&[^;]+;/g, (match) => entities[match] || match);
}

function cleanText(text) {
    return text
        .replace(/<[^>]*>/g, '\n')
        .replace(/&#?\w+;/g, unescapeHTML)
        .replace(/(\r\n|\n|\r){2,}/g, '\n')
        .replace(/ +/g, ' ')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n')
        .trim();
}

function createProgressModal() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
        background-color: rgba(0,0,0,0.4);
        display: flex;
        justify-content: center;
        align-items: center;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background-color: #fff;
        padding: 20px;
        border-radius: 8px;
        width: 80%;
        max-width: 500px;
        text-align: center;
    `;

    const title = document.createElement('h3');
    title.textContent = 'Download Progress';
    modalContent.appendChild(title);

    const progressBarContainer = document.createElement('div');
    progressBarContainer.style.cssText = `
        background-color: #ddd;
        border-radius: 4px;
        height: 20px;
        margin: 10px 0;
    `;

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
        width: 0%;
        height: 100%;
        background-color: #4CAF50;
        border-radius: 4px;
        transition: width 0.3s ease;
    `;
    progressBarContainer.appendChild(progressBar);

    const statusText = document.createElement('div');
    statusText.style.margin = '10px 0';
    statusText.textContent = 'Initializing...';

    const timeRemaining = document.createElement('div');
    timeRemaining.style.color = '#666';

    modalContent.appendChild(progressBarContainer);
    modalContent.appendChild(statusText);
    modalContent.appendChild(timeRemaining);
    modal.appendChild(modalContent);

    return {
        modal,
        updateProgress: (percentage, current, total, remaining) => {
            progressBar.style.width = `${percentage}%`;
            statusText.textContent = `Processing chapter ${current} of ${total}`;
            timeRemaining.textContent = `Estimated time remaining: ${remaining}`;
        },
        showMessage: (message) => {
            statusText.textContent = message;
        }
    };
}

async function downloadNovel(title, episodeLinks, startEpisode) {
    const { modal, updateProgress, showMessage } = createProgressModal();
    document.body.appendChild(modal);

    try {
        showMessage('Please select a download folder...');
        const directoryHandle = await window.showDirectoryPicker({
            startIn: 'downloads',
            mode: 'readwrite'
        });

        const totalChapters = episodeLinks.length - startEpisode + 1;
        const startTime = Date.now();
        let completed = 0;

        for (let i = episodeLinks.length - startEpisode; i >= 0; i--) {
            const episodeNumber = startEpisode + completed;
            const episodeUrl = episodeLinks[i];
            
            try {
                updateProgress(
                    (completed / totalChapters) * 100,
                    completed + 1,
                    totalChapters,
                    calculateTimeRemaining(startTime, completed, totalChapters)
                );

                showMessage(`Downloading chapter ${episodeNumber}...`);
                let content = await fetchNovelContent(episodeUrl);

                if (!content) {
                    showMessage(`CAPTCHA required for chapter ${episodeNumber}`);
                    const solved = await handleCaptcha(episodeUrl);
                    if (solved) content = await fetchNovelContent(episodeUrl);
                }

                if (content) {
                    showMessage(`Saving chapter ${episodeNumber}...`);
                    await saveChapter(directoryHandle, title, episodeNumber, content);
                    completed++;
                } else {
                    showMessage(`Skipping chapter ${episodeNumber}...`);
                }

                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Error processing chapter ${episodeNumber}: ${error.message}`);
                showMessage(`Error with chapter ${episodeNumber}: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        showMessage('Download complete!');
        setTimeout(() => document.body.removeChild(modal), 2000);
        alert('All chapters downloaded successfully!');

    } catch (error) {
        console.error(`Download failed: ${error.message}`);
        showMessage(`Download failed: ${error.message}`);
        setTimeout(() => document.body.removeChild(modal), 5000);
    }
}

async function handleCaptcha(url) {
    const result = confirm(`CAPTCHA detected!\nPlease solve it in the new tab and click OK.\nOpen ${url} now?`);
    if (result) window.open(url, '_blank');
    return result;
}

async function saveChapter(directoryHandle, title, number, content) {
    try {
        const fileName = `${title} - Chapter ${number}.txt`;
        const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    } catch (error) {
        throw new Error(`Failed to save chapter ${number}: ${error.message}`);
    }
}

function calculateTimeRemaining(startTime, completed, total) {
    const elapsed = Date.now() - startTime;
    const rate = elapsed / (completed || 1);
    const remaining = Math.round((total - completed) * rate / 1000);
    
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}m ${seconds}s`;
}

function extractTitle() {
    try {
        const titleElement = document.querySelector('#content_wrapper > div:nth-child(1) > span');
        return titleElement ? titleElement.textContent.trim() : 'Unknown Title';
    } catch (error) {
        console.error('Title extraction failed:', error);
        return 'Unknown Title';
    }
}

function extractEpisodeLinks() {
    try {
        return Array.from(document.querySelectorAll('.item-subject'))
                   .map(link => link.getAttribute('href'))
                   .filter(url => url.startsWith('https://booktoki'));
    } catch (error) {
        console.error('Episode link extraction failed:', error);
        return [];
    }
}

async function fetchPage(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const parser = new DOMParser();
        return parser.parseFromString(html, 'text/html');
    } catch (error) {
        console.error(`Failed to fetch page ${url}:`, error);
        return null;
    }
}

function createStartButton() {
    const btn = document.createElement('button');
    btn.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        padding: 15px 30px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-size: 16px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    `;
    btn.textContent = 'Start Novel Download';
    btn.onclick = async () => {
        btn.remove();
        if (!window.location.href.startsWith('https://booktoki')) {
            alert('Please run this on a Booktoki novel page');
            return;
        }

        try {
            const title = extractTitle();
            const totalPages = prompt('Enter total episode list pages:', '1');
            const episodeLinks = await gatherEpisodeLinks(totalPages);
            
            const startEpisode = prompt(`Start from episode (1-${episodeLinks.length}):`, '1');
            if (!startEpisode || startEpisode < 1 || startEpisode > episodeLinks.length) {
                alert('Invalid starting episode');
                return;
            }

            downloadNovel(title, episodeLinks, parseInt(startEpisode));
        } catch (error) {
            alert(`Initialization failed: ${error.message}`);
        }
    };
    document.body.appendChild(btn);
}

async function gatherEpisodeLinks(totalPages) {
    const pages = parseInt(totalPages, 10) || 1;
    let episodeLinks = [];
    
    for (let page = 1; page <= pages; page++) {
        const pageUrl = `${window.location.href.split('?')[0]}?spage=${page}`;
        const doc = await fetchPage(pageUrl);
        if (doc) {
            const links = Array.from(doc.querySelectorAll('.item-subject'))
                             .map(link => link.getAttribute('href'));
            episodeLinks.push(...links);
        }
    }
    
    if (episodeLinks.length === 0) {
        throw new Error('No episode links found');
    }
    
    return episodeLinks;
}

// Initialize the download button
createStartButton();
