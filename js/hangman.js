document.addEventListener("DOMContentLoaded", async () => {
    if (window.HaygAPI) await window.HaygAPI.requireAuth();

    const difficultySelect = document.getElementById("hangman-difficulty");
    const startOverlay = document.getElementById("hangman-start-overlay");
    const resultOverlay = document.getElementById("hangman-result-overlay");
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

    function renderWord(reveal = false) {
        wordDisplay.replaceChildren();
        for (const letter of currentWord) {
            const slot = document.createElement("span");
            slot.className = "hangman-letter-slot";
            if (reveal || guessedLetters.has(letter)) slot.textContent = letter;
            wordDisplay.appendChild(slot);
        }
        wordDisplay.setAttribute("aria-label", `${currentWord.length} տառանի գաղտնի բառ`);
    }

    function renderHangman() {
        missesDisplay.textContent = String(misses);
        hangmanParts.forEach((part, index) => {
            part.classList.toggle("visible", index < misses);
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

    async function finishRound(won) {
        if (roundFinished) return;
        roundFinished = true;

        const points = won ? 50 + (currentWord.length * 10) + ((maxMisses - misses) * 10) : 0;
        if (won) {
            currentStreak++;
        } else {
            currentStreak = 0;
        }
        streakDisplay.textContent = String(currentStreak);

        const isNewPersonalBest = won && currentStreak > bestStreak;
        if (isNewPersonalBest) {
            bestStreak = currentStreak;
            bestStreakDisplay.textContent = String(bestStreak);
        }
        totalScore += points;
        scoreDisplay.textContent = String(totalScore);

        renderWord(!won);

        resultIcon.classList.toggle("is-win", won);
        resultTitle.textContent = won ? "Գուշակեցիր բառը" : "Այս անգամ չյաջողեցաւ";
        resultWord.textContent = won ? currentWord : `Գաղտնի բառը՝ ${currentWord}`;
        resultPoints.textContent = isNewPersonalBest
            ? `Նոր անձնական լաւագոյն՝ ${currentStreak} `
            : points ? `+${points} XP` : "Այս փուլին XP չվաստակեցիր։";
        nextButton.textContent = "Յաջորդ բառը";
        resultOverlay.classList.remove("hidden");
        window.setGameKeyboardActive?.(false);
        statusDisplay.textContent = won ? "Բառը գուշակեցիր։" : "Վեց սխալ փորձերդ սպառեցան։";
        keyboard.querySelectorAll("button").forEach(button => {
            button.disabled = true;
        });

        if (won && window.HaygAPI) {
            try {
                await window.HaygAPI.updateScore("hangman", points);
            } catch (error) {
                console.error("Could not save Hangman score:", error);
            }
        }
        if (isNewPersonalBest) await savePersonalBest(currentStreak);
    }

    function guessLetter(letter) {
        if (roundFinished || guessedLetters.has(letter)) return;
        guessedLetters.add(letter);

        const key = keyboard.querySelector(`[data-letter="${letter}"]`);
        key.disabled = true;
        if (currentWord.includes(letter)) {
            key.classList.add("correct");
            key.setAttribute("aria-pressed", "true");
            statusDisplay.textContent = "Ճիշդ տառ մըն է։";
            renderWord();
            if ([...currentWord].every(character => guessedLetters.has(character))) {
                void finishRound(true);
            }
            return;
        }

        key.classList.add("incorrect");
        key.setAttribute("aria-pressed", "true");
        wrongLetters.push(letter);
        wrongLettersDisplay.textContent = wrongLetters.join(" · ");
        misses++;
        renderHangman();
        statusDisplay.textContent = "Այս տառը բառին մէջ չկայ։";
        if (misses >= maxMisses) void finishRound(false);
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
        wrongLettersDisplay.textContent = "";
        statusDisplay.textContent = "Ընտրէ՛ տառ մը՝ բառը գուշակելու համար։";
        renderWord();
        renderHangman();
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
