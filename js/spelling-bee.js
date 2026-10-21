document.addEventListener("DOMContentLoaded", async () => {
    if (window.HaygAPI) await window.HaygAPI.requireAuth();

    let currentPuzzle = null;
    let currentWord = "";
    let foundWords = [];
    let score = 0;
    let audioContext;
    let shuffledLetters = [];

    const currentWordDisplay = document.getElementById("current-word");
    const progressBoard = document.getElementById("progress-board");
    const foundCountDisplay = document.getElementById("found-count");
    const totalWordsCountDisplay = document.getElementById("total-words-count");
    const currentScoreDisplay = document.getElementById("current-score");
    const currentRankDisplay = document.getElementById("current-rank");
    const progressFill = document.getElementById("progress-fill");
    const gameMessage = document.getElementById("game-message");
    const letterRack = document.getElementById("letter-rack");

    const ranks = [
        { name: "Սկսնակ", min: 0 },
        { name: "Լաւ", min: 0.1 },
        { name: "Յառաջացած", min: 0.25 },
        { name: "Հիանալի", min: 0.4 },
        { name: "Գերազանց", min: 0.6 },
        { name: "Հանճարեղ", min: 0.8 }
    ];

    function initAudio() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playClickSound() {
        if (!audioContext) initAudio();
        const bufferSize = audioContext.sampleRate * 0.04;
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noiseSource = audioContext.createBufferSource();
        noiseSource.buffer = buffer;
        const filter = audioContext.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2500;
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.03);
        noiseSource.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);
        noiseSource.start();
    }

    function loadPuzzle() {
        const puzzles = typeof PUZZLES !== 'undefined' ? PUZZLES : [];
        if (puzzles.length === 0) return;

        // Random puzzle
        currentPuzzle = puzzles[Math.floor(Math.random() * puzzles.length)];

        // Include main word in total words to find
        currentPuzzle.allWords = [...currentPuzzle.subWords, currentPuzzle.mainWord];

        shuffledLetters = currentPuzzle.mainWord.split("");
        shuffleArray(shuffledLetters);

        resetGameState();
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function resetGameState() {
        currentWord = "";
        foundWords = [];
        score = 0;

        totalWordsCountDisplay.textContent = currentPuzzle.allWords.length;

        renderProgressBoard();
        renderLetterRack();
        updateUI();
    }

    function renderProgressBoard() {
        progressBoard.innerHTML = '';
        // Sort words by length, then alphabetically
        const sortedWords = [...currentPuzzle.allWords].sort((a, b) => {
            if (a.length !== b.length) return a.length - b.length;
            return a.localeCompare(b);
        });

        sortedWords.forEach(word => {
            const row = document.createElement("div");
            row.className = "word-row";
            row.dataset.word = word;

            for (let i = 0; i < word.length; i++) {
                const box = document.createElement("div");
                box.className = "letter-box";
                // Invisible until found
                row.appendChild(box);
            }
            progressBoard.appendChild(row);
        });
    }

    function renderLetterRack() {
        letterRack.innerHTML = '';
        shuffledLetters.forEach(letter => {
            const tile = document.createElement("div");
            tile.className = "letter-tile";
            tile.textContent = letter;
            tile.onclick = () => addLetter(letter);

            // Touch feedback
            tile.ontouchstart = () => tile.classList.add("key-pressed");
            tile.ontouchend = () => tile.classList.remove("key-pressed");
            tile.ontouchcancel = () => tile.classList.remove("key-pressed");

            letterRack.appendChild(tile);
        });
    }

    function addLetter(letter) {
        if (!currentPuzzle || currentWord.length >= currentPuzzle.mainWord.length) return;

        // Count occurrences in currentWord
        const currentCount = currentWord.split("").filter(l => l === letter).length;
        const maxCount = currentPuzzle.mainWord.split("").filter(l => l === letter).length;

        if (currentCount >= maxCount) {
            // Cannot use this letter more times than it appears in mainWord
            showMessage("Տառը սպառած է");
            return;
        }

        playClickSound();
        currentWord += letter;
        updateWordDisplay();
    }

    function deleteLetter() {
        if (currentWord.length === 0) return;
        playClickSound();
        currentWord = currentWord.slice(0, -1);
        updateWordDisplay();
    }

    function updateWordDisplay() {
        currentWordDisplay.textContent = currentWord;
    }

    function shuffleLetters() {
        playClickSound();
        shuffleArray(shuffledLetters);
        renderLetterRack();
    }

    function submitWord() {
        if (currentWord.length === 0) return;

        if (foundWords.includes(currentWord)) {
            showMessage("Արդէն գտած ես");
            currentWord = "";
            updateWordDisplay();
            return;
        }

        if (currentPuzzle.allWords.includes(currentWord)) {
            // Correct word!
            let wordScore = currentWord.length * 10;
            if (currentWord === currentPuzzle.mainWord) {
                wordScore = (currentWord.length * 20) + 50; // Bingo
            }

            score += wordScore;
            foundWords.push(currentWord);

            revealWord(currentWord);
            currentWord = "";
            updateWordDisplay();
            updateUI();

            // Award XP immediately for the found word
            if (window.HaygAPI) {
                window.HaygAPI.updateScore('bee', wordScore);
            }

            checkWinCondition();
        } else {
            showMessage("Այս բառարանին մէջ չկայ");
            currentWord = "";
            updateWordDisplay();
        }
    }

    function revealWord(word) {
        const row = document.querySelector(`.word-row[data-word="${word}"]`);
        if (row) {
            const boxes = row.querySelectorAll('.letter-box');
            for (let i = 0; i < word.length; i++) {
                boxes[i].textContent = word[i];
                boxes[i].classList.add('found');
            }
        }
    }

    function updateUI() {
        currentScoreDisplay.textContent = score;
        foundCountDisplay.textContent = foundWords.length;

        const progress = foundWords.length / currentPuzzle.allWords.length;
        progressFill.style.width = (progress * 100) + "%";

        let currentRank = ranks[0].name;
        for (let i = ranks.length - 1; i >= 0; i--) {
            if (progress >= ranks[i].min) {
                currentRank = ranks[i].name;
                break;
            }
        }
        currentRankDisplay.textContent = currentRank;
    }

    function showMessage(msg) {
        gameMessage.textContent = msg;
        gameMessage.classList.add("show");
        setTimeout(() => {
            gameMessage.classList.remove("show");
        }, 1500);
    }

    function checkWinCondition() {
        if (foundWords.length === currentPuzzle.allWords.length) {
            const completionBonus = 100;
            score += completionBonus; // Completion Bonus
            updateUI();
            showMessage("Շնորհաւոր, բոլորը գտար!");

            // Submit completion bonus XP
            if (window.HaygAPI) {
                window.HaygAPI.updateScore('bee', completionBonus);
            }

            setTimeout(() => {
                // Show next puzzle
                loadPuzzle();
            }, 3000);
        } else {
            showMessage("Ճիշդ է");
        }
    }

    // Event Listeners
    document.getElementById("delete-btn").onclick = deleteLetter;
    document.getElementById("shuffle-btn").onclick = shuffleLetters;
    document.getElementById("enter-btn").onclick = submitWord;

    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        if (e.key === "Enter") {
            submitWord();
        } else if (e.key === "Backspace") {
            deleteLetter();
        } else {
            const char = e.key.toUpperCase();
            if (currentPuzzle && currentPuzzle.mainWord.includes(char)) {
                addLetter(char);
            }
        }
    });

    document.querySelectorAll(".control-btn").forEach(btn => {
        btn.addEventListener("touchstart", () => btn.classList.add("key-pressed"), { passive: true });
        btn.addEventListener("touchend", () => btn.classList.remove("key-pressed"), { passive: true });
        btn.addEventListener("touchcancel", () => btn.classList.remove("key-pressed"), { passive: true });
    });

    const startBtn = document.getElementById("start-bee-btn");
    const startOverlay = document.getElementById("bee-start-overlay");
    if (startBtn) {
        startBtn.onclick = () => {
            startOverlay.classList.add("hidden");
            initAudio();
            loadPuzzle();
        };
    }

    document.addEventListener('click', initAudio, { once: true });
});
