document.addEventListener("DOMContentLoaded", async () => {
    if (window.HaygAPI) await window.HaygAPI.requireAuth();

    const wordsContainer = document.getElementById("words-container");
    const wordsDisplay = document.getElementById("words-display");
    const focusOverlay = document.getElementById("focus-overlay");
    const timeDisplay = document.getElementById("time-display");
    const wpmDisplay = document.getElementById("wpm-display");
    const accuracyDisplay = document.getElementById("accuracy-display");
    const keyboardContainer = document.getElementById("keyboard-container");
    const startBestDisplay = document.getElementById("typing-start-best");
    const startBestSpeedDisplay = document.getElementById("typing-start-best-speed");
    const bestScoreDisplay = document.getElementById("typing-best-score");
    const bestSpeedDisplay = document.getElementById("typing-best-speed");
    const recordNote = document.getElementById("typing-record-note");
    const resultCard = document.getElementById("typing-result-card");
    const timerSelect = document.getElementById("typing-timer-select");
    const resultDuration = document.getElementById("typing-result-duration");
    const resultOverlay = document.getElementById("typing-result-overlay");

    let isPlaying = false;
    let isGameOver = false;
    let isGameStarted = false;
    let maxTimer = 120;
    let timer = maxTimer;
    let timerInterval = null;

    let currentWords = [];
    let currentWordIndex = 0;
    let currentLetterIndex = 0;

    let totalKeystrokes = 0;
    let correctKeystrokes = 0;
    const bestScores = { 60: 0, 120: 0, 300: 0 };
    let bestSpeed = 0;
    let signedInUserId = null;
    let personalBestPromise = Promise.resolve();

    let audioContext;

    function bestScoreStorageKey(duration) {
        return signedInUserId
            ? `typing_${duration}_best_${signedInUserId}`
            : `typing_${duration}_best_guest`;
    }

    function getModeName(duration) {
        return `typing_${duration}`;
    }

    function bestSpeedStorageKey() {
        return signedInUserId
            ? `typing_best_speed_${signedInUserId}`
            : "typing_best_speed_guest";
    }

    function renderSelectedBest() {
        const duration = Number(timerSelect.value);
        const best = bestScores[duration] || 0;
        bestScoreDisplay.textContent = String(best);
        bestSpeedDisplay.textContent = String(bestSpeed);
    }

    async function loadPersonalBest() {
        const user = await window.HaygAPI?.getCurrentUser();
        signedInUserId = user?.id || null;
        try {
            bestSpeed = Number(localStorage.getItem(bestSpeedStorageKey())) || 0;
        } catch (error) {
            console.error("Could not load typing-game best speed from local storage:", error);
        }
        for (const duration of Object.keys(bestScores).map(Number)) {
            const storageKey = bestScoreStorageKey(duration);
            let localBest = 0;
            try {
                localBest = Number(localStorage.getItem(storageKey)) || 0;
            } catch (error) {
                console.error("Could not load typing-game personal best from local storage:", error);
            }
            bestScores[duration] = localBest;

            if (signedInUserId && window.HaygAPI?.getPersonalBest) {
                try {
                    const databaseBest = Number(await window.HaygAPI.getPersonalBest(getModeName(duration))) || 0;
                    bestScores[duration] = Math.max(localBest, databaseBest);
                    if (bestScores[duration] > databaseBest) {
                        await window.HaygAPI.updatePersonalBest(getModeName(duration), bestScores[duration]);
                    }
                    if (bestScores[duration] > localBest) {
                        localStorage.setItem(storageKey, String(bestScores[duration]));
                    }
                } catch (error) {
                    console.error(`Could not load ${duration}-second typing-game personal best:`, error);
                }
            }
        }

        if (signedInUserId && window.HaygAPI?.getPersonalBest) {
            try {
                const databaseBestSpeed = Number(await window.HaygAPI.getPersonalBest("typing", "speed")) || 0;
                bestSpeed = Math.max(bestSpeed, databaseBestSpeed);
                if (bestSpeed > databaseBestSpeed) {
                    await window.HaygAPI.updatePersonalBest("typing", bestSpeed, "speed");
                }
                if (bestSpeed > 0) {
                    localStorage.setItem(bestSpeedStorageKey(), String(bestSpeed));
                }
            } catch (error) {
                console.error("Could not load typing-game best speed from the database:", error);
            }
        }
        renderSelectedBest();
    }

    async function savePersonalBest(duration, score) {
        const previousBest = bestScores[duration] || 0;
        if (score <= previousBest) return false;

        bestScores[duration] = score;
        renderSelectedBest();

        try {
            localStorage.setItem(bestScoreStorageKey(duration), String(score));
        } catch (error) {
            console.error("Could not save typing-game personal best locally:", error);
        }

        if (signedInUserId && window.HaygAPI?.updatePersonalBest) {
            try {
                await window.HaygAPI.updatePersonalBest(getModeName(duration), score);
            } catch (error) {
                console.error(`Could not save ${duration}-second typing-game personal best to the database:`, error);
            }
            try {
                await window.HaygAPI.updatePersonalBest("typing", score);
            } catch (error) {
                console.error("Could not update overall typing-game personal best:", error);
            }
        }
        return true;
    }

    async function saveBestSpeed(speed) {
        if (speed <= bestSpeed) return false;

        bestSpeed = speed;
        renderSelectedBest();
        try {
            localStorage.setItem(bestSpeedStorageKey(), String(speed));
        } catch (error) {
            console.error("Could not save typing-game best speed locally:", error);
        }
        if (signedInUserId && window.HaygAPI?.updatePersonalBest) {
            try {
                await window.HaygAPI.updatePersonalBest("typing", speed, "speed");
            } catch (error) {
                console.error("Could not save typing-game best speed to the database:", error);
            }
        }
        return true;
    }

    function initAudio() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function initKeyboard() {
        keyboardContainer.innerHTML = '';
        const keyboardLayout = window.HaygKeyboard.getRows()
            .map(row => [...row.toLowerCase()]);
        keyboardLayout[keyboardLayout.length - 1].push('⌫');
        keyboardLayout.push(['SPACE', '↻']);
        for (let row of keyboardLayout) {
            let keyboardRow = document.createElement("div");
            keyboardRow.className = "keyboard-row";

            for (let key of row) {
                let button = document.createElement("button");
                button.textContent = key === 'SPACE' ? '␣' : key;
                button.setAttribute("data-key", key);

                if (key === 'SPACE') {
                    button.classList.add("wide-button");
                    button.style.flex = "1";
                } else if (key === '⌫' || key === '↻') {
                    button.classList.add("wide-button");
                    if (key === '↻') {
                        button.style.flex = "0.2";
                    }
                }

                button.addEventListener("mousedown", (e) => {
                    e.preventDefault(); // Prevent losing focus on words container
                    if (key === '↻') {
                        resetGame();
                    } else {
                        handleInput(key);
                    }
                });
                keyboardRow.appendChild(button);
            }
            keyboardContainer.appendChild(keyboardRow);
        }
    }

    function appendParagraphWords(paragraph) {
        // Clean and prepare the paragraph (resolve Armenian ligatures, convert hyphens/dashes to spaces)
        const prepared = paragraph
            .replace(/և/g, "եւ")
            .replace(/Եվ/g, "Եւ")
            .replace(/ԵՎ/g, "Եւ")
            .replace(/[-—–]/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        const words = prepared.split(" ").filter(w => w.length > 0);
        
        const startIndex = currentWords.length;
        words.forEach((word, index) => {
            const wIndex = startIndex + index;
            
            // Clean the word for typing comparison (lowercase Armenian letters only)
            const cleanWord = word.replace(/[^Ա-Ֆա-ֆ]/g, "").toLowerCase();
            currentWords.push(cleanWord);

            const wordEl = document.createElement("div");
            wordEl.className = "word";
            wordEl.id = `word-${wIndex}`;

            let typableIndex = 0;
            for (let i = 0; i < word.length; i++) {
                const char = word[i];
                const letterEl = document.createElement("span");
                
                if (/[Ա-Ֆա-ֆ]/.test(char)) {
                    letterEl.className = "letter";
                    letterEl.id = `letter-${wIndex}-${typableIndex}`;
                    typableIndex++;
                } else {
                    letterEl.className = "letter punctuation";
                }
                
                letterEl.textContent = char;
                wordEl.appendChild(letterEl);
            }
            wordsDisplay.appendChild(wordEl);
        });
    }

    function generateWords() {
        currentWords = [];
        wordsDisplay.innerHTML = '';
        wordsDisplay.style.transform = "translateY(0)";

        const paragraphPool = (typeof typingParagraphs !== 'undefined' && typingParagraphs.length > 0) ? typingParagraphs : [
            "Հայաստանը հնագոյն երկիր է, որը յայտնի է իր հարուստ մշակոյթով եւ գեղեցիկ բնութեամբ։"
        ];

        // Shuffle and append the first 5 paragraphs
        const shuffled = [...paragraphPool].sort(() => Math.random() - 0.5);
        shuffled.forEach(para => {
            appendParagraphWords(para);
        });
    }

    function renderWords() {
        updateActiveLetter();
    }

    function updateActiveLetter() {
        // Remove active class from all
        document.querySelectorAll('.letter.active, .word.active, .word.waiting-space').forEach(el => {
            el.classList.remove('active', 'waiting-space');
        });

        if (currentWordIndex < currentWords.length) {
            const wordEl = document.getElementById(`word-${currentWordIndex}`);
            if (wordEl) {
                wordEl.classList.add('active');

                // Scroll if needed
                const containerRect = wordsContainer.getBoundingClientRect();
                const wordRect = wordEl.getBoundingClientRect();
                if (wordRect.bottom > containerRect.bottom || wordRect.top < containerRect.top) {
                    wordsDisplay.style.transform = `translateY(-${wordEl.offsetTop - 20}px)`;
                }

                if (currentLetterIndex < currentWords[currentWordIndex].length) {
                    const letterEl = document.getElementById(`letter-${currentWordIndex}-${currentLetterIndex}`);
                    if (letterEl) letterEl.classList.add('active');
                } else {
                    // Active state at the end of word (waiting for space)
                    wordEl.classList.add('waiting-space');
                }
            }
        }
    }

    function startGame() {
        if (isPlaying) return;
        isPlaying = true;
        isGameOver = false;
        focusOverlay.classList.add('hidden');
        window.setGameKeyboardActive?.(true);

        timerInterval = setInterval(() => {
            timer--;
            timeDisplay.textContent = timer;

            // Real-time WPM update
            calculateStats();

            if (timer <= 0) {
                endGame();
            }
        }, 1000);
    }

    async function endGame() {
        isPlaying = false;
        isGameOver = true;
        window.setGameKeyboardActive?.(false);
        clearInterval(timerInterval);
        calculateStats();

        const finalWpm = wpmDisplay.textContent;
        const finalAcc = accuracyDisplay.textContent;
        const scoreEarned = correctKeystrokes * 2;
        const completedDuration = maxTimer;
        recordNote.textContent = "";
        resultCard.classList.remove("new-record");

        document.getElementById("final-wpm").textContent = finalWpm;
        document.getElementById("final-accuracy").textContent = finalAcc;
        document.getElementById("final-score").textContent = String(scoreEarned);
        resultDuration.textContent = ``;
        bestScoreDisplay.textContent = String(bestScores[completedDuration] || 0);

        const resultTitle = document.querySelector("#typing-result-overlay h2");
        if (resultTitle) {
            resultTitle.innerHTML = `${timer > 0 ? "Ամբողջացուցիք" : "Ժամանակը սպառեցաւ"}`;
        }

        resultOverlay.classList.remove("hidden");
        isGameStarted = false;

        await personalBestPromise;
        if (window.HaygAPI) {
            try {
                await window.HaygAPI.updateScore('typing', scoreEarned);
            } catch (error) {
                console.error("Could not save typing-game score:", error);
            }
        }
        const isNewBestScore = await savePersonalBest(completedDuration, scoreEarned);
        const isNewBestSpeed = await saveBestSpeed(Number(finalWpm) || 0);
        if (isNewBestScore || isNewBestSpeed) {
            resultCard.classList.remove("new-record");
            void resultCard.offsetWidth;
            resultCard.classList.add("new-record");
            recordNote.textContent = isNewBestScore && isNewBestSpeed
                ? "Նոր անձնական նիշ եւ արագութիւն։"
                : isNewBestSpeed ? "Նոր լաւագոյն արագութիւն։" : "Նոր անձնական լաւագոյն նիշ։";
        }
    }

    function calculateStats() {
        const timeElapsed = maxTimer - timer;
        const minutes = timeElapsed > 0 ? timeElapsed / 60 : 0;

        let correctSpaces = 0;
        for (let i = 0; i < currentWordIndex; i++) {
            const wordEl = document.getElementById(`word-${i}`);
            if (wordEl && !wordEl.querySelector('.letter.incorrect')) {
                correctSpaces++;
            }
        }

        // Standard WPM: 5 characters = 1 word (including correct spaces)
        const wpm = minutes > 0 ? Math.round(((correctKeystrokes + correctSpaces) / 5) / minutes) : 0;
        wpmDisplay.textContent = wpm;

        const accuracy = totalKeystrokes > 0 ? Math.round((correctKeystrokes / totalKeystrokes) * 100) : 100;
        accuracyDisplay.textContent = `${accuracy}%`;
    }

    function resetGame() {
        clearInterval(timerInterval);
        isPlaying = false;
        isGameOver = false;
        const select = document.getElementById('typing-timer-select');
        maxTimer = select ? parseInt(select.value) : 120;
        timer = maxTimer;
        currentWordIndex = 0;
        currentLetterIndex = 0;
        totalKeystrokes = 0;
        correctKeystrokes = 0;

        timeDisplay.textContent = timer;
        wpmDisplay.textContent = "0";
        accuracyDisplay.textContent = "100%";
        wordsDisplay.style.transform = "translateY(0)";
        recordNote.textContent = "";
        resultCard.classList.remove("new-record");

        focusOverlay.textContent = "Սկսիր տպել";
        focusOverlay.classList.remove('hidden');
        resultOverlay.classList.add("hidden");

        generateWords();
        renderWords();
    }

    const startOverlay = document.getElementById("typing-start-overlay");
    const startBtn = document.getElementById("start-typing-btn");
    const select = document.getElementById('typing-timer-select');

    if (startBtn && startOverlay) {
        startBtn.addEventListener("click", (e) => {
            resetGame();
            startOverlay.classList.add("hidden");
            isGameStarted = true;
            e.currentTarget.blur();
        });
    }

    const retryBtn = document.getElementById("retry-typing-btn");
    if (retryBtn) {
        retryBtn.addEventListener("click", (e) => {
            resetGame();
            isGameStarted = true;
            e.currentTarget.blur();
        });
    }

    document.getElementById("typing-change-duration").addEventListener("click", () => {
        resultOverlay.classList.add("hidden");
        startOverlay.classList.remove("hidden");
        timerSelect.focus();
    });

    timerSelect.addEventListener("change", renderSelectedBest);

    if (select) {
        maxTimer = parseInt(select.value);
        timer = maxTimer;
        timeDisplay.textContent = timer;
    }

    function animateVirtualKey(key) {
        const buttons = document.querySelectorAll(".keyboard-row button");
        for (let btn of buttons) {
            if (btn.getAttribute("data-key") === key) {
                btn.classList.add("pressed");
                setTimeout(() => btn.classList.remove("pressed"), 100);
                break;
            }
        }
    }

    function playClickSound() {
        if (!audioContext) initAudio();

        // Typewriter mechanical click (white noise burst through a bandpass filter)
        const bufferSize = audioContext.sampleRate * 0.04; // 40ms buffer
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseSource = audioContext.createBufferSource();
        noiseSource.buffer = buffer;

        const filter = audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2500; // Crisp high-mid frequency
        filter.Q.value = 0.5;

        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0.8, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.03);

        noiseSource.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);

        noiseSource.start();
    }

    function handleInput(key) {
        if (!isGameStarted || isGameOver) return;
        if (!isPlaying) startGame();

        playClickSound();
        animateVirtualKey(key);

        if (key === '⌫' || key === 'Backspace') {
            if (currentLetterIndex > 0) {
                currentLetterIndex--;
                const letterEl = document.getElementById(`letter-${currentWordIndex}-${currentLetterIndex}`);
                if (letterEl) {
                    if (letterEl.classList.contains('correct')) {
                        correctKeystrokes--;
                    }
                    letterEl.classList.remove('correct', 'incorrect');
                }
                updateActiveLetter();
            } else if (currentWordIndex > 0) {
                // Move back to previous word
                currentWordIndex--;
                const prevWord = currentWords[currentWordIndex];
                currentLetterIndex = prevWord.length;

                // Remove correct class from punctuation when going back
                const prevWordEl = document.getElementById(`word-${currentWordIndex}`);
                if (prevWordEl) {
                    prevWordEl.querySelectorAll('.punctuation').forEach(pEl => {
                        pEl.classList.remove('correct');
                    });
                }

                updateActiveLetter();
            }
            calculateStats();
            return;
        }

        if (key === 'SPACE' || key === ' ') {
            // Only move to next word if we are at the end of the current word
            // This prevents accidental "skipping" of the whole word
            if (currentWordIndex < currentWords.length - 1 && currentLetterIndex === currentWords[currentWordIndex].length) {
                // Move to next word
                const currentWordEl = document.getElementById(`word-${currentWordIndex}`);
                if (currentWordEl) {
                    currentWordEl.classList.remove('waiting-space');
                    // Mark punctuation inside this word as correct/finished
                    currentWordEl.querySelectorAll('.punctuation').forEach(pEl => {
                        pEl.classList.add('correct');
                    });
                }

                currentWordIndex++;
                currentLetterIndex = 0;

                // If close to the end, dynamically load and append another paragraph
                if (currentWordIndex >= currentWords.length - 3) {
                    const paragraphPool = (typeof typingParagraphs !== 'undefined' && typingParagraphs.length > 0) ? typingParagraphs : [
                        "Հայաստանը հնագոյն երկիր է, որը յայտնի է իր հարուստ մշակոյթով եւ գեղեցիկ բնութեամբ։"
                    ];
                    const randomPara = paragraphPool[Math.floor(Math.random() * paragraphPool.length)];
                    appendParagraphWords(randomPara);
                }

                updateActiveLetter();
                calculateStats();
            } else if (currentWordIndex === currentWords.length - 1 && currentLetterIndex === currentWords[currentWordIndex].length) {
                // Finished last word!
                const currentWordEl = document.getElementById(`word-${currentWordIndex}`);
                if (currentWordEl) {
                    currentWordEl.querySelectorAll('.punctuation').forEach(pEl => {
                        pEl.classList.add('correct');
                    });
                }
                endGame();
            }
            return;
        }

        // Ignore punctuation typing
        if (/[^a-zA-Z0-9ա-ֆԱ-Ֆ]/.test(key)) {
            return;
        }

        const targetWord = currentWords[currentWordIndex];
        if (currentLetterIndex < targetWord.length) {
            totalKeystrokes++;
            const letterEl = document.getElementById(`letter-${currentWordIndex}-${currentLetterIndex}`);

            if (key === targetWord[currentLetterIndex]) {
                letterEl.classList.add('correct');
                correctKeystrokes++;
            } else {
                letterEl.classList.add('incorrect');
            }

            currentLetterIndex++;
            updateActiveLetter();
            calculateStats();
        }
    }

    // Physical keyboard listener
    document.addEventListener("keydown", (e) => {
        // Ignore modifiers
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        // Prevent default scrolling for spacebar
        if (e.key === " " && document.activeElement === document.body) {
            e.preventDefault();
        }

        let keyToProcess = e.key;

        if (e.key.length === 1) {
            // Ensure lower case for comparison
            keyToProcess = e.key.toLowerCase();
        }

        if (keyToProcess === " " || keyToProcess === "Backspace" || keyToProcess.length === 1) {
            handleInput(keyToProcess);
        }
    });

    wordsContainer.addEventListener("click", () => {
        if (!isGameStarted) return; // Ignore clicks if we haven't started yet

        if (!isPlaying && !isGameOver) {
            startGame();
        } else if (isGameOver) {
            resetGame();
        }
    });

    document.addEventListener('click', initAudio, { once: true });
    document.addEventListener('keydown', initAudio, { once: true });

    initKeyboard();
    window.HaygKeyboard?.onLayoutChange(initKeyboard);
    personalBestPromise = loadPersonalBest();
    resetGame();
});
