document.addEventListener("DOMContentLoaded", async () => {
    if (window.HaygAPI) await window.HaygAPI.requireAuth();

    let currentPuzzle = null;
    let currentWord = "";
    let foundWords = [];
    let score = 0;
    let audioContext;
    let shuffledLetters = [];
    let selectedTileIndices = [];

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

    let clickNoiseBuffer = null;

    function initAudio() {
        if (!audioContext) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                audioContext = new AudioContextClass();
            }
        }
        if (audioContext && audioContext.state === "suspended") {
            audioContext.resume().catch(() => {});
        }
        if (audioContext && !clickNoiseBuffer) {
            try {
                const bufferSize = Math.floor(audioContext.sampleRate * 0.035);
                clickNoiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
                const data = clickNoiseBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
                }
            } catch (_) {}
        }
    }

    function playClickSound() {
        try {
            initAudio();
            if (!audioContext || audioContext.state !== "running" || !clickNoiseBuffer) return;
            const now = audioContext.currentTime;
            const noise = audioContext.createBufferSource();
            noise.buffer = clickNoiseBuffer;
            const filter = audioContext.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(2500, now);
            const gainNode = audioContext.createGain();
            gainNode.gain.setValueAtTime(0.25, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
            noise.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(audioContext.destination);
            noise.start(now);
        } catch (_) {}
    }

    function playWordFoundSound() {
        try {
            initAudio();
            if (!audioContext || audioContext.state !== "running") return;
            const now = audioContext.currentTime;
            const notes = [659.25, 830.61, 987.77]; // E5, G#5, B5
            notes.forEach((freq, i) => {
                const noteTime = now + (i * 0.075);
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(freq, noteTime);
                gain.gain.setValueAtTime(0.2, noteTime);
                gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.26);
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.start(noteTime);
                osc.stop(noteTime + 0.26);
            });
        } catch (_) {}
    }

    function playBingoSound() {
        try {
            initAudio();
            if (!audioContext || audioContext.state !== "running") return;
            const now = audioContext.currentTime;
            const notes = [659.25, 830.61, 987.77, 1318.51]; // E5, G#5, B5, E6
            notes.forEach((freq, i) => {
                const noteTime = now + (i * 0.085);
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.type = i === 3 ? "triangle" : "sine";
                osc.frequency.setValueAtTime(freq, noteTime);
                gain.gain.setValueAtTime(0.26, noteTime);
                gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.42);
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.start(noteTime);
                osc.stop(noteTime + 0.42);
            });
        } catch (_) {}
    }

    function playErrorSound() {
        try {
            initAudio();
            if (!audioContext || audioContext.state !== "running") return;
            const now = audioContext.currentTime;
            [0, 0.085].forEach((delay, idx) => {
                const noteTime = now + delay;
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.type = "triangle";
                osc.frequency.setValueAtTime(idx === 0 ? 175 : 145, noteTime);
                gain.gain.setValueAtTime(0.18, noteTime);
                gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.07);
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.start(noteTime);
                osc.stop(noteTime + 0.07);
            });
        } catch (_) {}
    }

    function playGameCompleteSound() {
        try {
            initAudio();
            if (!audioContext || audioContext.state !== "running") return;
            const now = audioContext.currentTime;
            const chords = [
                { time: 0, freqs: [523.25, 659.25, 783.99] }, // C major
                { time: 0.16, freqs: [587.33, 739.99, 880.00] }, // D major
                { time: 0.35, freqs: [659.25, 830.61, 987.77, 1318.51] } // E major / high
            ];
            chords.forEach(chord => {
                chord.freqs.forEach(freq => {
                    const osc = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(freq, now + chord.time);
                    gain.gain.setValueAtTime(0.16, now + chord.time);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + chord.time + 0.45);
                    osc.connect(gain);
                    gain.connect(audioContext.destination);
                    osc.start(now + chord.time);
                    osc.stop(now + chord.time + 0.45);
                });
            });
        } catch (_) {}
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
        selectedTileIndices = [];
        foundWords = [];
        score = 0;

        totalWordsCountDisplay.textContent = currentPuzzle.allWords.length;

        renderProgressBoard();
        renderLetterRack();
        updateWordDisplay();
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
        shuffledLetters.forEach((letter, index) => {
            const tile = document.createElement("div");
            tile.className = "letter-tile";
            tile.dataset.index = index;
            if (selectedTileIndices.includes(index)) {
                tile.classList.add("used");
            }
            tile.textContent = letter;
            tile.onclick = () => handleTileClick(index);

            // Touch feedback
            tile.ontouchstart = () => tile.classList.add("key-pressed");
            tile.ontouchend = () => tile.classList.remove("key-pressed");
            tile.ontouchcancel = () => tile.classList.remove("key-pressed");

            letterRack.appendChild(tile);
        });
    }

    function updateRackHighlights() {
        const tiles = letterRack.querySelectorAll('.letter-tile');
        tiles.forEach((tile, index) => {
            if (selectedTileIndices.includes(index)) {
                tile.classList.add('used');
            } else {
                tile.classList.remove('used');
            }
        });
    }

    function handleTileClick(index) {
        if (selectedTileIndices.includes(index)) {
            // Clicking the most recently selected letter deletes/unselects it
            if (selectedTileIndices[selectedTileIndices.length - 1] === index) {
                deleteLetter();
            }
            return;
        }
        addTileByIndex(index);
    }

    function addTileByIndex(index) {
        if (!currentPuzzle || index < 0 || index >= shuffledLetters.length) return;
        if (currentWord.length >= currentPuzzle.mainWord.length) return;
        if (selectedTileIndices.includes(index)) return;

        selectedTileIndices.push(index);
        currentWord += shuffledLetters[index];
        playClickSound();
        updateWordDisplay();
        updateRackHighlights();
    }

    function addLetter(letter) {
        if (!currentPuzzle || currentWord.length >= currentPuzzle.mainWord.length) return;

        // Find first unused tile matching this letter
        const availableIndex = shuffledLetters.findIndex((l, i) => l === letter && !selectedTileIndices.includes(i));

        if (availableIndex === -1) {
            // Cannot use this letter more times than available in rack
            playErrorSound();
            showMessage("Տառը սպառած է");
            return;
        }

        addTileByIndex(availableIndex);
    }

    function deleteLetter() {
        if (currentWord.length === 0) return;
        playClickSound();
        selectedTileIndices.pop();
        currentWord = currentWord.slice(0, -1);
        updateWordDisplay();
        updateRackHighlights();
    }

    function clearCurrentWord() {
        currentWord = "";
        selectedTileIndices = [];
        updateWordDisplay();
        updateRackHighlights();
    }

    function updateWordDisplay() {
        currentWordDisplay.textContent = currentWord;
    }

    function shuffleLetters() {
        playClickSound();
        shuffleArray(shuffledLetters);
        // Map currently typed characters to new tile positions so highlights remain intact
        const newSelected = [];
        for (const char of currentWord) {
            const idx = shuffledLetters.findIndex((l, i) => l === char && !newSelected.includes(i));
            if (idx !== -1) {
                newSelected.push(idx);
            }
        }
        selectedTileIndices = newSelected;
        renderLetterRack();
    }

    function submitWord() {
        if (currentWord.length === 0) return;

        if (foundWords.includes(currentWord)) {
            playErrorSound();
            showMessage("Արդէն գտած ես");
            clearCurrentWord();
            return;
        }

        if (currentPuzzle.allWords.includes(currentWord)) {
            // Correct word!
            let wordScore = currentWord.length * 10;
            if (currentWord === currentPuzzle.mainWord) {
                wordScore = (currentWord.length * 20) + 50; // Bingo
                playBingoSound();
            } else {
                playWordFoundSound();
            }

            score += wordScore;
            foundWords.push(currentWord);

            revealWord(currentWord);
            clearCurrentWord();
            updateUI();

            // Award XP immediately for the found word
            if (window.HaygAPI) {
                window.HaygAPI.updateScore('bee', wordScore);
            }

            checkWinCondition();
        } else {
            playErrorSound();
            showMessage("Այս բառարանին մէջ չկայ");
            clearCurrentWord();
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
            playGameCompleteSound();
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
