async function fetchNovelContent(url) {
    const response = await fetch(url);

    if (!response.ok) {
        console.error(`Failed to fetch content from ${url}. Status: ${response.status}`);
        return null;
    }

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const content = doc.querySelector('#novel_content');

    if (!content) {
        console.error(`Failed to find '#novel_content' element on the page: ${url}`);
        return null;
    }

    return cleanText(content.innerHTML);
}

function unescapeHTML(text) {
    const entities = {
        '&lt;': '<', '&gt;': '>', '&amp;': '&',
        '&quot;': '"', '&apos;': "'", '&#039;': "'",
        '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—',
        '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”'
    };

    Object.entries(entities).forEach(([entity, replacement]) => {
        const regex = new RegExp(entity, 'g');
        text = text.replace(regex, replacement);
    });

    return text;
}

function cleanText(text) {
    text = text.replace(/<div>/g, '');
    text = text.replace(/<\/div>/g, '');
    text = text.replace(/<p>/g, '\n');
    text = text.replace(/<\/p>/g, '\n');
    text = text.replace(/<br\s*[/]?>/g, '\n');
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/ {2,}/g, ' ');
    text = text.replace(/\n{2,}/g, '\n');
    text = unescapeHTML(text);
    
    text = text.split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 0)
              .join('\n');
    text = text.replace(/^\n+|\n+$/g, '');

    return text;
}

function createModal() {
    const modal = document.createElement('div');
    modal.id = 'downloadProgressModal';
    modal.style.display = 'block';
    modal.style.position = 'fixed';
    modal.style.zIndex = '1';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.overflow = 'auto';
    modal.style.backgroundColor = 'rgba(0,0,0,0.4)';

    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = '#fefefe';
    modalContent.style.position = 'relative';
    modalContent.style.margin = '15% auto 0';
    modalContent.style.padding = '20px';
    modalContent.style.border = '1px solid #888';
    modalContent.style.width = '50%';
    modalContent.style.textAlign = 'center';

    modal.appendChild(modalContent);

    return {modal, modalContent};
}

async function downloadNovel(title, episodeLinks, startEpisode) {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const {modal, modalContent} = createModal();
    document.body.appendChild(modal);

    // Request directory handle
    let directoryHandle;
    try {
        directoryHandle = await window.showDirectoryPicker({
            startIn: 'downloads',
            mode: 'readwrite'
        });
    } catch (error) {
        console.log('Directory selection cancelled by user');
        document.body.removeChild(modal);
        return;
    }

    const progressBar = document.createElement('div');
    progressBar.style.width = '0%';
    progressBar.style.height = '10px';
    progressBar.style.backgroundColor = '#008CBA';
    progressBar.style.marginTop = '10px';
    progressBar.style.borderRadius = '3px';
    modalContent.appendChild(progressBar);

    const progressLabel = document.createElement('div');
    progressLabel.style.marginTop = '5px';
    modalContent.appendChild(progressLabel);

    const startTime = new Date();
    const startingIndex = episodeLinks.length - startEpisode;

    for (let i = startingIndex; i >= 0; i--) {
        const episodeUrl = episodeLinks[i];
        const episodeNumber = startingIndex - i + 1;

        if (!episodeUrl.startsWith('https://booktoki')) {
            console.log(`Skipping invalid episode link: ${episodeUrl}`);
            continue;
        }

        console.log(`Downloading: ${title} - Episode ${episodeNumber}/${startingIndex + 1}`);

        let episodeContent = await fetchNovelContent(episodeUrl);

        if (!episodeContent) {
            console.error(`Failed to fetch content for episode: ${episodeUrl}`);
            const userConfirmed = await new Promise(resolve => {
                const confirmResult = confirm(`CAPTCHA detected on page!\n${episodeUrl}\nPlease solve the CAPTCHA in a new tab and click OK to continue.`);
                resolve(confirmResult);
            });

            if (userConfirmed) {
                episodeContent = await fetchNovelContent(episodeUrl);
                if (!episodeContent) {
                    console.error(`Failed to fetch content after CAPTCHA: ${episodeUrl}`);
                    continue;
                }
            } else {
                console.log("Download cancelled by user. Skipping this episode.");
                continue;
            }
        }

        // Save file to selected directory
        try {
            const fileName = `${title} - Episode ${episodeNumber}.txt`;
            const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(episodeContent);
            await writable.close();
        } catch (error) {
            console.error('Error saving file:', error);
            alert(`Failed to save episode ${episodeNumber}: ${error.message}`);
            continue;
        }

        // Update progress
        const progress = (episodeNumber / (startingIndex + 1)) * 100;
        progressBar.style.width = `${progress}%`;

        const elapsedTime = new Date() - startTime;
        const estimatedTotalTime = (elapsedTime / progress) * 100;
        const remainingTime = estimatedTotalTime - elapsedTime;
        const remainingMinutes = Math.floor(remainingTime / (1000 * 60));
        const remainingSeconds = Math.floor((remainingTime % (1000 * 60)) / 1000);

        progressLabel.textContent = `Downloading... ${progress.toFixed(2)}% - Time remaining: ${remainingMinutes}m ${remainingSeconds}s`;

        await delay(Math.random() * 500 + 1000);
    }

    document.body.removeChild(modal);
    alert('All chapters downloaded successfully!');
    console.log('All chapters downloaded successfully!');
}

function extractTitle() {
    const titleElement = document.evaluate('//*[@id="content_wrapper"]/div[1]/span', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    return titleElement ? titleElement.textContent.trim() : null;
}

function extractEpisodeLinks() {
    const episodeLinks = [];
    const links = document.querySelectorAll('.item-subject');

    links.forEach(link => {
        const episodeLink = link.getAttribute('href');
        episodeLinks.push(episodeLink);
    });

    return episodeLinks;
}

async function fetchPage(url) {
    const response = await fetch(url);
    if (!response.ok) {
        console.error(`Failed to fetch page: ${url}. Status: ${response.status}`);
        return null;
    }
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return doc;
}

async function runCrawler() {
    const novelPageRule = 'https://booktoki';
    let currentUrl = window.location.href.split('?')[0];

    if (!currentUrl.startsWith(novelPageRule)) {
        alert('Please run this script on a novel episode list page (booktoki domain)');
        return;
    }

    const title = extractTitle();
    if (!title) {
        alert('Failed to extract novel title');
        return;
    }

    const totalPages = prompt(`Enter the number of pages in the episode list:\n(Enter 1 if less than 1000 episodes, 2 or more for 1000+ episodes)`, '1');
    if (!totalPages || isNaN(totalPages)) {
        alert('Invalid page number input');
        return;
    }

    const totalPagesNumber = parseInt(totalPages, 10);
    const allEpisodeLinks = [];

    for (let page = 1; page <= totalPagesNumber; page++) {
        const nextPageUrl = `${currentUrl}?spage=${page}`;
        const nextPageDoc = await fetchPage(nextPageUrl);
        if (nextPageDoc) {
            const nextPageLinks = Array.from(nextPageDoc.querySelectorAll('.item-subject')).map(link => link.getAttribute('href'));
            allEpisodeLinks.push(...nextPageLinks);
        }
    }

    const startEpisode = prompt(`Enter the starting episode number (1 to ${allEpisodeLinks.length}):`, '1');
    if (!startEpisode || isNaN(startEpisode)) {
        alert('Invalid episode number input');
        return;
    }

    const startEpisodeNumber = parseInt(startEpisode, 10);
    if (startEpisodeNumber < 1 || startEpisodeNumber > allEpisodeLinks.length) {
        alert('Episode number out of range');
        return;
    }

    downloadNovel(title, allEpisodeLinks, startEpisodeNumber);
}

runCrawler();
