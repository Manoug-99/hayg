document.addEventListener("DOMContentLoaded", async () => {
    if (window.HaygAPI) await window.HaygAPI.requireAuth();

    const difficultySelect = document.getElementById("hangman-difficulty");
    const startOverlay = document.getElementById("hangman-start-overlay");
    const resultOverlay = document.getElementById("hangman-result-overlay");
    const fireOverlay = document.createElement("div");
    fireOverlay.className = "hangman-fire-overlay";
    fireOverlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(fireOverlay);
    const startButton = document.getElementById("hangman-start-btn");
    const nextButton = document.getElementById("hangman-next-btn");
    const keyboard = document.getElementById("hangman-keyboard");
    const wordDisplay = document.getElementById("hangman-word");
    const statusDisplay = document.getElementById("hangman-status");
    const wrongLettersDisplay = document.getElementById("hangman-wrong-letters");
    const missesDisplay = document.getElementById("hangman-misses");
    const scoreDisplay = document.getElementById("hangman-score");
    const streakDisplay = document.getElementById("hangman-streak");
    const bestStreakDisplay = document.getElementById("hangman-best-streak");
    const resultIcon = document.getElementById("hangman-result-icon");
    const resultTitle = document.getElementById("hangman-result-title");
    const resultWord = document.getElementById("hangman-result-word");
    const resultPoints = document.getElementById("hangman-result-points");
    const hangmanParts = [...document.querySelectorAll(".hangman-part")];

    const maxMisses = 6;
    const lengthRanges = {
        short: word => word.length >= 3 && word.length <= 5,
        medium: word => word.length >= 6 && word.length <= 8,
        long: word => word.length >= 9
    };

    let wordPools = { short: [], medium: [], long: [] };
    let drawBag = [];
    let currentWord = "";
    let guessedLetters = new Set();
    let wrongLetters = [];
    let misses = 0;
    let totalScore = 0;
    let currentStreak = 0;
    let bestStreak = 0;
    let personalBestStorageKey = "hangman_best_guest";
    let signedInUserId = null;
    let roundFinished = true;
    let activeDifficulty = "short";
    let lastWord = "";
    let roundPoints = 0;
    let roundStatsApplied = false;
    let roundNewPersonalBest = false;
    let fireCleanupTimeout = 0;

    let audioContext = null;
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

    function playKeyClickSound() {
        try {
            initAudio();
            if (!audioContext || audioContext.state !== "running" || !clickNoiseBuffer) return;
            const now = audioContext.currentTime;
            const noise = audioContext.createBufferSource();
            noise.buffer = clickNoiseBuffer;
            const filter = audioContext.createBiquadFilter();
            filter.type = "bandpass";
            filter.frequency.setValueAtTime(2400, now);
            filter.Q.setValueAtTime(1.0, now);
            const gain = audioContext.createGain();
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(audioContext.destination);
            noise.start(now);
        } catch (_) {}
    }

    function playCorrectLetterSound() {
        try {
            initAudio();
            if (!audioContext || audioContext.state !== "running") return;
            const now = audioContext.currentTime;
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.start(now);
            osc.stop(now + 0.28);
        } catch (_) {}
    }

    function playWrongLetterSound() {
        try {
            initAudio();
            if (!audioContext || audioContext.state !== "running") return;
            const now = audioContext.currentTime;
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(190, now);
            osc.frequency.exponentialRampToValueAtTime(85, now + 0.2);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.start(now);
            osc.stop(now + 0.2);
        } catch (_) {}
    }

    function playRopeSnapSound() {
        try {
            initAudio();
            if (!audioContext || audioContext.state !== "running") return;
            const now = audioContext.currentTime;
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(950, now);
            osc.frequency.exponentialRampToValueAtTime(280, now + 0.15);
            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.start(now);
            osc.stop(now + 0.15);
        } catch (_) {}
    }

    function playFallImpactSound() {
        try {
            initAudio();
            if (!audioContext || audioContext.state !== "running") return;
            const now = audioContext.currentTime;
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(115, now);
            osc.frequency.exponentialRampToValueAtTime(36, now + 0.35);
            gain.gain.setValueAtTime(0.38, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.connect(gain);
            gain.connect(audioContext.destination);
            osc.start(now);
            osc.stop(now + 0.35);
        } catch (_) {}
    }

    function playWordWinSound() {
        try {
            initAudio();
            if (!audioContext || audioContext.state !== "running") return;
            const now = audioContext.currentTime;
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, i) => {
                const noteTime = now + (i * 0.08);
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(freq, noteTime);
                gain.gain.setValueAtTime(0.18, noteTime);
                gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.32);
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.start(noteTime);
                osc.stop(noteTime + 0.32);
            });
        } catch (_) {}
    }


    function normalizeWord(value) {
        if (typeof value !== "string") return "";
        return value
            .normalize("NFC")
            .toLowerCase()
            .replace(/և/g, "եւ")
            .replace(/[^ա-ֆ]/g, "");
    }

    function collectWords() {
        const words = new Set();
        const add = value => {
            const word = normalizeWord(value);
            if (word.length >= 3) words.add(word);
        };
        const addList = list => {
            if (Array.isArray(list)) list.forEach(add);
        };
        const addDictionary = dictionary => {
            if (dictionary && typeof dictionary === "object") {
                Object.values(dictionary).forEach(addList);
            }
        };

        addList(window.targetWords);
        addDictionary(window.wordleWords);
        addDictionary(window.ztypeWords);

        const spellingSections = window.SPELLING_QUESTION_SECTIONS;
        if (spellingSections && typeof spellingSections === "object") {
            Object.values(spellingSections).forEach(entries => {
                if (Array.isArray(entries)) entries.forEach(entry => add(entry?.word));
            });
        }

        if (Array.isArray(window.PUZZLES)) {
            window.PUZZLES.forEach(puzzle => {
                add(puzzle?.mainWord);
                addList(puzzle?.subWords);
                addList(puzzle?.allWords);
            });
        }

        const allWords = [...words];
        wordPools = {
            short: allWords.filter(lengthRanges.short),
            medium: allWords.filter(lengthRanges.medium),
            long: allWords.filter(lengthRanges.long)
        };
    }

    function populateDifficultyOptions() {
        for (const option of difficultySelect.options) {
            const available = wordPools[option.value].length;
            option.disabled = available === 0;
        }

        const firstAvailable = Object.keys(wordPools).find(key => wordPools[key].length > 0);
        if (!firstAvailable) {
            startButton.disabled = true;
            statusDisplay.textContent = "Բառերու բառարանը չյաջողեցաւ բեռնել։";
            return false;
        }

        difficultySelect.value = wordPools[difficultySelect.value].length ? difficultySelect.value : firstAvailable;
        return true;
    }

    function shuffle(items) {
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
        return items;
    }

    function nextWord() {
        if (drawBag.length === 0) {
            drawBag = shuffle([...wordPools[activeDifficulty]]);
            if (drawBag.length > 1 && drawBag[drawBag.length - 1] === lastWord) {
                [drawBag[0], drawBag[drawBag.length - 1]] = [drawBag[drawBag.length - 1], drawBag[0]];
            }
        }
        currentWord = drawBag.pop();
        lastWord = currentWord;
    }

    function renderWord(reveal = false, justGuessedLetter = null) {
        if (wordDisplay.children.length !== currentWord.length) {
            wordDisplay.replaceChildren();
            for (let i = 0; i < currentWord.length; i++) {
                const slot = document.createElement("span");
                slot.className = "hangman-letter-slot";
                wordDisplay.appendChild(slot);
            }
        }

        const slots = wordDisplay.querySelectorAll(".hangman-letter-slot");
        let matchCount = 0;
        slots.forEach((slot, index) => {
            const letter = currentWord[index];
            if (guessedLetters.has(letter)) {
                const wasEmpty = !slot.textContent;
                slot.textContent = letter;
                if (letter === justGuessedLetter && wasEmpty) {
                    slot.style.animationDelay = `${matchCount * 0.08}s`;
                    slot.classList.remove("slot-revealed");
                    void slot.offsetWidth;
                    slot.classList.add("slot-revealed");
                    matchCount++;
                } else if (!slot.classList.contains("slot-revealed")) {
                    slot.classList.add("slot-revealed");
                }
            } else if (reveal) {
                slot.textContent = letter;
                slot.classList.add("missed-word-letter");
            } else {
                slot.textContent = "";
                slot.className = "hangman-letter-slot";
                slot.style.animationDelay = "";
            }
        });

        wordDisplay.setAttribute("aria-label", `${currentWord.length} տառանի գաղտնի բառ`);
    }

    function renderWrongLetters(newestLetter = null) {
        wrongLettersDisplay.replaceChildren();
        wrongLetters.forEach((letter, i) => {
            if (i > 0) {
                const separator = document.createElement("span");
                separator.className = "wrong-letter-sep";
                separator.textContent = " · ";
                wrongLettersDisplay.appendChild(separator);
            }
            const badge = document.createElement("span");
            badge.className = "wrong-letter-chip";
            badge.textContent = letter;
            if (letter === newestLetter) {
                badge.classList.add("newly-added");
            }
            wrongLettersDisplay.appendChild(badge);
        });
    }

    function renderHangman(isNewMiss = false) {
        missesDisplay.textContent = String(misses);

        if (isNewMiss) {
            missesDisplay.classList.remove("miss-pulse");
            void missesDisplay.offsetWidth;
            missesDisplay.classList.add("miss-pulse");

            const art = document.querySelector(".hangman-art");
            if (art) {
                art.classList.remove("art-shake");
                void art.offsetWidth;
                art.classList.add("art-shake");
            }

            const figure = document.getElementById("hangman-figure");
            if (figure) {
                figure.classList.remove("swaying");
                void figure.offsetWidth;
                figure.classList.add("swaying");
            }
        }

        hangmanParts.forEach((part, index) => {
            const isVisible = index < misses;
            const wasVisible = part.classList.contains("visible");
            part.classList.toggle("visible", isVisible);
            if (isVisible && !wasVisible && isNewMiss) {
                part.classList.remove("drawing");
                void part.offsetWidth;
                part.classList.add("drawing");
            }
        });
    }

    function resetHangmanVisuals() {
        const rope = document.getElementById("hangman-rope");
        const figure = document.getElementById("hangman-figure");
        const dust = document.getElementById("hangman-dust");
        const art = document.querySelector(".hangman-art");

        if (rope) rope.classList.remove("snapped");
        if (figure) {
            figure.classList.remove("falling", "fallen", "swaying");
        }
        if (dust) dust.classList.remove("active");
        if (art) art.classList.remove("art-shake", "art-thud");

        hangmanParts.forEach(part => {
            part.classList.remove("visible", "drawing");
        });
    }

    async function loadPersonalBest() {
        const user = await window.HaygAPI?.getCurrentUser();
        signedInUserId = user?.id || null;
        personalBestStorageKey = signedInUserId
            ? `hangman_best_${signedInUserId}`
            : "hangman_best_guest";

        let localBest = 0;
        try {
            localBest = Number(localStorage.getItem(personalBestStorageKey)) || 0;
            bestStreak = localBest;
        } catch (error) {
            console.error("Could not load Hangman personal best from local storage:", error);
        }

        if (signedInUserId && window.HaygAPI?.getPersonalBest) {
            try {
                const databaseBest = await window.HaygAPI.getPersonalBest("hangman");
                bestStreak = Math.max(bestStreak, Number(databaseBest) || 0);
                if (localBest > Number(databaseBest)) {
                    await window.HaygAPI.updatePersonalBest("hangman", bestStreak);
                }
            } catch (error) {
                console.error("Could not load Hangman personal best from the database:", error);
            }
        }

        bestStreakDisplay.textContent = String(bestStreak);
    }

    async function savePersonalBest(streak) {
        bestStreak = Math.max(bestStreak, streak);
        bestStreakDisplay.textContent = String(bestStreak);

        try {
            localStorage.setItem(personalBestStorageKey, String(bestStreak));
        } catch (error) {
            console.error("Could not save Hangman personal best locally:", error);
        }

        if (signedInUserId && window.HaygAPI?.updatePersonalBest) {
            try {
                const savedBest = await window.HaygAPI.updatePersonalBest("hangman", bestStreak);
                if (savedBest !== null) {
                    bestStreak = Math.max(bestStreak, Number(savedBest) || 0);
                    bestStreakDisplay.textContent = String(bestStreak);
                }
            } catch (error) {
                console.error("Could not save Hangman personal best to the database:", error);
                statusDisplay.textContent = "Անձնական լաւագոյնը պահուեցաւ սարքին մէջ, բայց ոչ տուեալներու պահեստին մէջ։";
            }
        }
    }

    function createKeyboard() {
        keyboard.replaceChildren();
        window.HaygKeyboard.getRows().map(rowLetters => rowLetters.toLowerCase()).forEach(rowLetters => {
            const row = document.createElement("div");
            row.className = `keyboard-row${rowLetters.length > 10 ? " keyboard-row-wide" : ""}`;
            for (const letter of rowLetters) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "hangman-key";
                button.dataset.letter = letter;
                button.textContent = letter;
                button.setAttribute("aria-label", `Գուշակել ${letter} տառը`);
                if (guessedLetters.has(letter)) {
                    button.classList.add(currentWord.includes(letter) ? "correct" : "incorrect");
                    button.setAttribute("aria-pressed", "true");
                }
                button.disabled = roundFinished || guessedLetters.has(letter);
                button.addEventListener("click", () => guessLetter(letter));
                row.appendChild(button);
            }
            keyboard.appendChild(row);
        });
    }

    function handleGameOverSequence() {
        roundFinished = true;
        window.setGameKeyboardActive?.(false);
        keyboard.querySelectorAll("button").forEach(button => {
            button.disabled = true;
        });

        statusDisplay.textContent = "Վեց սխալ փորձերդ սպառեցան...";
        statusDisplay.classList.remove("status-wrong", "status-correct");
        void statusDisplay.offsetWidth;
        statusDisplay.classList.add("status-wrong");

        const rope = document.getElementById("hangman-rope");
        const figure = document.getElementById("hangman-figure");
        const dust = document.getElementById("hangman-dust");
        const art = document.querySelector(".hangman-art");

        // Allow 6th part (right leg) drawing animation to finish (~360ms)
        setTimeout(() => {
            playRopeSnapSound();
            if (rope) rope.classList.add("snapped");
            if (figure) {
                figure.classList.remove("swaying");
                figure.classList.add("falling");
            }

            // Mid-fall impact on platform (~430ms after fall starts)
            setTimeout(() => {
                playFallImpactSound();
                if (art) {
                    art.classList.remove("art-thud");
                    void art.offsetWidth;
                    art.classList.add("art-thud");
                }
                if (dust) {
                    dust.classList.remove("active");
                    void dust.offsetWidth;
                    dust.classList.add("active");
                }
            }, 430);

            // After fall completes (~920ms after fall starts), show game over screen
            setTimeout(() => {
                if (figure) {
                    figure.classList.remove("falling");
                    figure.classList.add("fallen");
                }
                void finishRound(false);
            }, 920);
        }, 360);
    }

    function applyRoundStats(won) {
        if (roundStatsApplied) return;
        roundStatsApplied = true;
        roundPoints = won ? 50 + (currentWord.length * 10) + ((maxMisses - misses) * 10) : 0;
        if (won) {
            currentStreak++;
        } else {
            currentStreak = 0;
        }
        streakDisplay.textContent = String(currentStreak);

        roundNewPersonalBest = won && currentStreak > bestStreak;
        if (roundNewPersonalBest) {
            bestStreak = currentStreak;
            bestStreakDisplay.textContent = String(bestStreak);
        }
        totalScore += roundPoints;
        scoreDisplay.textContent = String(totalScore);
    }

    function playStreakFire() {
        if (currentStreak < 3 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

        window.clearTimeout(fireCleanupTimeout);
        fireOverlay.replaceChildren();

        const emberCount = Math.min(36, 16 + currentStreak * 2);
        const embers = document.createDocumentFragment();
        for (let i = 0; i < emberCount; i++) {
            const ember = document.createElement("i");
            ember.className = "hangman-fire-ember";
            ember.style.setProperty("--ember-left", `${Math.random() * 100}%`);
            ember.style.setProperty("--ember-drift", `${(Math.random() - 0.5) * 34}vw`);
            ember.style.setProperty("--ember-delay", `${Math.random() * 0.55}s`);
            ember.style.setProperty("--ember-duration", `${1.1 + Math.random() * 0.8}s`);
            ember.style.setProperty("--ember-size", `${3 + Math.random() * 5}px`);
            embers.appendChild(ember);
        }
        fireOverlay.appendChild(embers);
        fireOverlay.classList.remove("active");
        void fireOverlay.offsetWidth;
        fireOverlay.classList.add("active");

        fireCleanupTimeout = window.setTimeout(() => {
            fireOverlay.classList.remove("active");
            fireOverlay.replaceChildren();
        }, 2100);
    }

    async function finishRound(won) {
        if (roundFinished && resultOverlay.classList.contains("hidden") === false) return;
        roundFinished = true;
        applyRoundStats(won);

        renderWord(!won);

        resultIcon.classList.toggle("is-win", won);
        resultTitle.textContent = won ? "Գուշակեցիր բառը" : "Այս անգամ չյաջողեցար";
        resultWord.textContent = won ? currentWord : `Գաղտնի բառը՝ ${currentWord}`;
        resultPoints.textContent = roundNewPersonalBest
            ? `Նոր անձնական լաւագոյն՝ ${currentStreak} `
            : roundPoints ? `+${roundPoints} XP` : "Այս փուլին XP չվաստակեցիր։";
        nextButton.textContent = "Յաջորդ բառը";
        resultOverlay.classList.remove("hidden");
        window.setGameKeyboardActive?.(false);
        statusDisplay.textContent = won ? "Բառը գուշակեցիր։" : "Վեց սխալ փորձերդ սպառեցան։";
        keyboard.querySelectorAll("button").forEach(button => {
            button.disabled = true;
        });

        if (won && window.HaygAPI) {
            try {
                await window.HaygAPI.updateScore("hangman", roundPoints);
            } catch (error) {
                console.error("Could not save Hangman score:", error);
            }
        }
        if (roundNewPersonalBest) await savePersonalBest(currentStreak);
    }

    function guessLetter(letter) {
        if (roundFinished || guessedLetters.has(letter)) return;
        guessedLetters.add(letter);
        playKeyClickSound();

        const key = keyboard.querySelector(`[data-letter="${letter}"]`);
        if (key) {
            key.disabled = true;
            key.setAttribute("aria-pressed", "true");
        }

        if (currentWord.includes(letter)) {
            playCorrectLetterSound();
            if (key) {
                key.classList.add("correct", "key-pop-correct");
            }
            statusDisplay.textContent = "Ճիշդ տառ մըն է։";
            statusDisplay.classList.remove("status-wrong", "status-correct");
            void statusDisplay.offsetWidth;
            statusDisplay.classList.add("status-correct");

            renderWord(false, letter);

            const isWordComplete = [...currentWord].every(character => guessedLetters.has(character));
            if (isWordComplete) {
                roundFinished = true;
                window.setGameKeyboardActive?.(false);
                keyboard.querySelectorAll("button").forEach(button => {
                    button.disabled = true;
                });

                statusDisplay.textContent = "Շնորհաւոր, բառը գուշակեցիր։";
                statusDisplay.classList.remove("status-wrong", "status-correct");
                void statusDisplay.offsetWidth;
                statusDisplay.classList.add("status-correct");

                // Step 1: Allow the final letter's flip-reveal animation to fully complete (~450ms)
                setTimeout(() => {
                    playWordWinSound();
                    const slots = wordDisplay.querySelectorAll(".hangman-letter-slot");
                    const waveDuration = 600; // ms
                    const staggerStep = 75; // ms

                    // Step 2: Trigger celebration wave across all letters
                    slots.forEach((slot, index) => {
                        slot.style.animationDelay = `${index * staggerStep}ms`;
                        slot.classList.remove("slot-revealed");
                        void slot.offsetWidth;
                        slot.classList.add("slot-celebrate");
                    });

                    applyRoundStats(true);
                    playStreakFire();
                    scoreDisplay.classList.remove("stat-pop");
                    streakDisplay.classList.remove("stat-pop");
                    void scoreDisplay.offsetWidth;
                    scoreDisplay.classList.add("stat-pop");
                    streakDisplay.classList.add("stat-pop");

                    // Step 3: Wait for the entire wave across all letters to finish before showing winning modal
                    const totalWaveTime = (slots.length * staggerStep) + waveDuration + 300;
                    setTimeout(() => {
                        void finishRound(true);
                    }, totalWaveTime);
                }, 450);
            }
            return;
        }

        playWrongLetterSound();
        if (key) {
            key.classList.add("incorrect", "key-shake-wrong");
        }
        wrongLetters.push(letter);
        renderWrongLetters(letter);
        misses++;
        renderHangman(true);

        statusDisplay.textContent = "Այս տառը բառին մէջ չկայ։";
        statusDisplay.classList.remove("status-wrong", "status-correct");
        void statusDisplay.offsetWidth;
        statusDisplay.classList.add("status-wrong");

        if (misses >= maxMisses) {
            handleGameOverSequence();
        }
    }

    function startRound() {
        if (roundFinished && !startOverlay.classList.contains("hidden")) {
            activeDifficulty = difficultySelect.value;
            drawBag = [];
        }
        if (!wordPools[activeDifficulty].length) return;

        nextWord();
        guessedLetters = new Set();
        wrongLetters = [];
        misses = 0;
        roundFinished = false;
        roundPoints = 0;
        roundStatsApplied = false;
        roundNewPersonalBest = false;
        renderWrongLetters();
        resetHangmanVisuals();
        statusDisplay.className = "hangman-status";
        statusDisplay.textContent = "Ընտրէ՛ տառ մը՝ բառը գուշակելու համար։";
        scoreDisplay.classList.remove("stat-pop");
        streakDisplay.classList.remove("stat-pop");
        missesDisplay.classList.remove("miss-pulse");
        renderWord();
        renderHangman(false);
        createKeyboard();
        startOverlay.classList.add("hidden");
        resultOverlay.classList.add("hidden");
        window.setGameKeyboardActive?.(true);
    }

    document.addEventListener("keydown", event => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
        const letter = normalizeWord(event.key);
        if (letter.length === 1 && keyboard.querySelector(`[data-letter="${letter}"]`)) {
            event.preventDefault();
            guessLetter(letter);
        }
    });

    startButton.addEventListener("click", startRound);
    nextButton.addEventListener("click", startRound);
    window.HaygKeyboard?.onLayoutChange(createKeyboard);
    collectWords();
    await loadPersonalBest();
    if (populateDifficultyOptions()) {
        renderHangman();
        createKeyboard();
    }
});
