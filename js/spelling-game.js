(() => {
    const categories = {
        "Բ թէ Փ": ["բ", "փ"],
        "Ո թէ Օ": ["ո", "օ"],
        "Դ թէ Թ": ["դ", "թ"],
        "Ե թէ Է": ["ե", "է"],
        "Ր թէ Ռ": ["ր", "ռ"],
        "Վ թէ Ւ": ["վ", "ւ"],
        "Ք թէ Գ": ["ք", "գ"],
        "Չ թէ Ջ": ["չ", "ջ"],
        "Հ թէ Յ": ["հ", "յ"],
        "Ձ թէ Ց": ["ձ", "ց"]
    };
    const categoriesInOrder = Object.keys(categories);
    const initialTime = 15;
    const maxTime = 15;
    const startingLives = 3;
    const answerDelay = 350;

    function normalizeQuestionIndex(index) {
        if (typeof index === "number") return index;
        if (typeof index === "string" && /^\d+$/.test(index)) return Number(index);
        return NaN;
    }

    function normalizeQuestionCategory(category) {
        if (categories[category]) return category;
        const letters = category.split(" թէ ");
        if (letters.length !== 2) return category;
        const reversedCategory = `${letters[1]} թէ ${letters[0]}`;
        return categories[reversedCategory] ? reversedCategory : category;
    }

    function validateQuestionBank(questions) {
        if (!Array.isArray(questions) || questions.length === 0) {
            throw new Error("The spelling question bank is empty.");
        }

        const ids = new Set();
        const questionsSeen = new Set();
        const counts = Object.fromEntries(categoriesInOrder.map(category => [category, 0]));

        for (const question of questions) {
            const pair = categories[question.category];
            if (!pair) throw new Error(`Unknown spelling category: ${question.category}`);
            if (!question.id || ids.has(question.id)) throw new Error(`Missing or duplicate question ID: ${question.id}`);
            if (!question.word) throw new Error(`Missing word: ${question.word}`);
            const index = normalizeQuestionIndex(question.index);
            if (!Number.isInteger(index) || index < 0 || index >= question.word.length) {
                throw new Error(`Invalid missing-letter position for ${question.id}`);
            }
            if (question.hint !== undefined && typeof question.hint !== "string") {
                throw new Error(`Invalid hint for ${question.id}`);
            }
            if (question.word[index] !== pair[0] && question.word[index] !== pair[1]) {
                throw new Error(`Question ${question.id} does not test its assigned category.`);
            }
            const questionKey = `${question.category}\0${question.word}\0${index}`;
            if (questionsSeen.has(questionKey)) {
                throw new Error(`Duplicate spelling question: ${question.word} at index ${index}`);
            }
            ids.add(question.id);
            questionsSeen.add(questionKey);
            counts[question.category]++;
        }

        const emptyCategories = categoriesInOrder.filter(category => counts[category] === 0);
        if (emptyCategories.length) throw new Error(`Categories without questions: ${emptyCategories.join(", ")}`);
        return counts;
    }

    window.validateSpellingQuestionBank = validateQuestionBank;

    document.addEventListener("DOMContentLoaded", async () => {
        if (window.HaygAPI) await window.HaygAPI.requireAuth();

        const sections = window.SPELLING_QUESTION_SECTIONS || {};
        const questions = Object.entries(sections).flatMap(([category, entries]) =>
            entries.map((entry, index) => ({
                ...entry,
                index: normalizeQuestionIndex(entry.index),
                id: `${category}-${index + 1}`,
                category: normalizeQuestionCategory(category)
            }))
        );
        try {
            validateQuestionBank(questions);
        } catch (error) {
            console.error("Invalid spelling question bank:", error);
            document.getElementById("spelling-feedback").textContent = "Հարցերը բեռնելու սխալ մը պատահեցաւ։";
            document.getElementById("spelling-start").disabled = true;
            return;
        }

        const timerDisplay = document.getElementById("spelling-timer");
        const scoreDisplay = document.getElementById("spelling-score");
        const categoryDisplay = document.getElementById("spelling-category");
        const questionDisplay = document.getElementById("spelling-question");
        const hintDisplay = document.getElementById("spelling-hint");
        const hintTextDisplay = document.getElementById("spelling-hint-text");
        const choicesContainer = document.getElementById("spelling-choices");
        const feedbackDisplay = document.getElementById("spelling-feedback");
        const livesDisplay = document.getElementById("spelling-lives");
        const introOverlay = document.getElementById("spelling-intro");
        const resultsOverlay = document.getElementById("spelling-results");
        const saveStatus = document.getElementById("spelling-save-status");
        const personalBestCard = document.getElementById("spelling-personal-best-card");
        const personalBestDisplay = document.getElementById("spelling-final-best");
        const recordNote = document.getElementById("spelling-record-note");
        const mistakesSection = document.getElementById("spelling-mistakes");
        const mistakesList = document.getElementById("spelling-mistakes-list");
        const noMistakesMessage = document.getElementById("spelling-no-mistakes");
        const xpCounter = document.getElementById("spelling-xp-counter");
        const xpDescription = document.getElementById("spelling-xp-description");
        const xpRemaining = document.getElementById("spelling-xp-remaining");
        const startButtons = [
            document.getElementById("spelling-start"),
            document.getElementById("spelling-restart")
        ];

        let running = false;
        let startingRound = false;
        let answering = false;
        let deadline = 0;
        let ticker = null;
        let score = 0;
        let correctCount = 0;
        let wrongCount = 0;
        let mistakes = [];
        let lives = startingLives;
        let deck = [];
        let currentQuestion = null;
        let saveAttempted = false;
        let scoredRound = false;
        let scoredRoundId = null;
        let answerTimeout = null;
        let roundId = 0;
        let audioContext = null;
        let personalBestPromise = Promise.resolve({ score: 0, userId: null, storageKey: "spelling_best_guest" });

        function shuffled(items) {
            const result = [...items];
            for (let i = result.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [result[i], result[j]] = [result[j], result[i]];
            }
            return result;
        }

        function formatDisplayWord(word) {
            const lowercaseWord = word.toLocaleLowerCase("hy");
            return lowercaseWord
                ? lowercaseWord[0].toLocaleUpperCase("hy") + lowercaseWord.slice(1)
                : lowercaseWord;
        }

        function fitQuestionWord() {
            questionDisplay.style.fontSize = "";
            const availableWidth = questionDisplay.clientWidth;
            const wordWidth = questionDisplay.scrollWidth;
            if (availableWidth > 0 && wordWidth > availableWidth) {
                const fontSize = Number.parseFloat(window.getComputedStyle(questionDisplay).fontSize);
                questionDisplay.style.fontSize = `${fontSize * availableWidth / wordWidth}px`;
            }
        }

        function appendHighlightedLetter(container, word, index, className) {
            const displayedWord = formatDisplayWord(word);
            container.append(document.createTextNode(displayedWord.slice(0, index)));
            const letter = document.createElement("span");
            letter.className = className;
            letter.textContent = displayedWord[index];
            container.append(letter, document.createTextNode(displayedWord.slice(index + 1)));
        }

        function renderMistakes() {
            mistakesList.replaceChildren(...mistakes.map(({ question, chosenLetter }) => {
                const index = Number(question.index);
                const incorrectWord = question.word.slice(0, index)
                    + chosenLetter
                    + question.word.slice(index + 1);
                const item = document.createElement("li");
                const mistaken = document.createElement("span");
                mistaken.className = "spelling-mistaken-word";
                appendHighlightedLetter(mistaken, incorrectWord, index, "spelling-mistaken-letter");
                const arrow = document.createElement("span");
                arrow.className = "spelling-mistake-arrow";
                arrow.setAttribute("aria-hidden", "true");
                arrow.textContent = "→";
                const correction = document.createElement("strong");
                correction.className = "spelling-corrected-word";
                appendHighlightedLetter(correction, question.word, index, "spelling-correct-letter");
                item.append(mistaken, arrow, correction);
                return item;
            }));
            mistakesSection.hidden = mistakes.length === 0;
            noMistakesMessage.hidden = mistakes.length > 0;
        }

        function createDeck() {
            const buckets = Object.fromEntries(categoriesInOrder.map(category => [
                category,
                shuffled(questions.filter(question => question.category === category))
            ]));
            const positions = Object.fromEntries(categoriesInOrder.map(category => [category, 0]));
            const result = [];
            while (result.length < questions.length) {
                for (const category of shuffled(categoriesInOrder)) {
                    const position = positions[category];
                    if (position < buckets[category].length) {
                        result.push(buckets[category][position]);
                        positions[category]++;
                    }
                }
            }
            return result;
        }

        function renderTimer(remaining) {
            const seconds = Math.max(0, Math.ceil(remaining / 1000));
            timerDisplay.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
            timerDisplay.classList.toggle("is-low", seconds <= 5);
        }

        function renderStats() {
            scoreDisplay.textContent = String(score);
            const heartSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            heartSvg.setAttribute("viewBox", "0 0 24 24");
            heartSvg.setAttribute("aria-hidden", "true");
            const heartPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            heartPath.setAttribute("d", "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z");
            heartSvg.append(heartPath);
            livesDisplay.replaceChildren(...Array.from({ length: startingLives }, (_, index) => {
                const heart = document.createElement("span");
                heart.className = `spelling-heart ${index < lives ? "is-filled" : "is-empty"}`;
                heart.append(heartSvg.cloneNode(true));
                return heart;
            }));
            livesDisplay.setAttribute("aria-label", `${lives} կեանք մնաց`);
        }

        function dropLostHeart() {
            const hearts = livesDisplay.querySelectorAll(".spelling-heart.is-filled");
            const heart = hearts[hearts.length - 1];
            if (!heart) return;

            const rect = heart.getBoundingClientRect();
            const fallingHeart = heart.cloneNode(true);
            fallingHeart.classList.add("is-dropping");
            fallingHeart.setAttribute("aria-hidden", "true");
            fallingHeart.style.left = `${rect.left}px`;
            fallingHeart.style.top = `${rect.top}px`;
            fallingHeart.addEventListener("animationend", () => fallingHeart.remove(), { once: true });
            document.body.append(fallingHeart);
        }

        function showTimerIncrease() {
            timerDisplay.classList.remove("is-increased");
            void timerDisplay.offsetWidth;
            timerDisplay.classList.add("is-increased");

            const timerWrap = timerDisplay.closest(".spelling-timer-wrap");
            const previousBonus = timerWrap.querySelector(".spelling-time-bonus");
            if (previousBonus) previousBonus.remove();

            const bonus = document.createElement("span");
            bonus.className = "spelling-time-bonus";
            bonus.setAttribute("aria-hidden", "true");
            bonus.textContent = "+2s";
            timerWrap.append(bonus);
            bonus.addEventListener("animationend", () => bonus.remove(), { once: true });
        }

        function showScoreIncrease() {
            scoreDisplay.classList.remove("is-increased");
            void scoreDisplay.offsetWidth;
            scoreDisplay.classList.add("is-increased");

            const scoreWrap = scoreDisplay.closest(".spelling-score-wrap");
            const previousBonus = scoreWrap.querySelector(".spelling-score-bonus");
            if (previousBonus) previousBonus.remove();

            const bonus = document.createElement("span");
            bonus.className = "spelling-score-bonus";
            bonus.setAttribute("aria-hidden", "true");
            bonus.textContent = "+10";
            scoreWrap.append(bonus);
            bonus.addEventListener("animationend", () => bonus.remove(), { once: true });
        }

        renderStats();

        function unlockAudio() {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;

            try {
                audioContext = audioContext || new AudioContextClass();
                if (audioContext.state === "suspended") {
                    audioContext.resume().catch(error => {
                        console.warn("Could not enable spelling-game sounds:", error);
                    });
                }
            } catch (error) {
                console.warn("Could not initialize spelling-game sounds:", error);
                audioContext = null;
            }
        }

        function playAnswerSound(isCorrect) {
            if (!audioContext || audioContext.state !== "running") return;

            const start = audioContext.currentTime;
            const notes = isCorrect
                ? [{ frequency: 660, offset: 0 }, { frequency: 880, offset: 0.11 }]
                : [{ frequency: 300, offset: 0 }, { frequency: 220, offset: 0.1 }];

            for (const note of notes) {
                const oscillator = audioContext.createOscillator();
                const volume = audioContext.createGain();
                const noteStart = start + note.offset;
                oscillator.type = isCorrect ? "sine" : "triangle";
                oscillator.frequency.setValueAtTime(note.frequency, noteStart);
                if (!isCorrect) {
                    oscillator.frequency.linearRampToValueAtTime(note.frequency * 0.72, noteStart + 0.16);
                }
                volume.gain.setValueAtTime(0.0001, noteStart);
                volume.gain.linearRampToValueAtTime(0.12, noteStart + 0.015);
                volume.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.18);
                oscillator.connect(volume);
                volume.connect(audioContext.destination);
                oscillator.start(noteStart);
                oscillator.stop(noteStart + 0.19);
            }
        }

        function playRecordSound() {
            if (!audioContext || audioContext.state !== "running") return;

            const start = audioContext.currentTime;
            [660, 880, 1100].forEach((frequency, index) => {
                const noteStart = start + index * 0.1;
                const oscillator = audioContext.createOscillator();
                const volume = audioContext.createGain();
                oscillator.type = "sine";
                oscillator.frequency.setValueAtTime(frequency, noteStart);
                volume.gain.setValueAtTime(0.0001, noteStart);
                volume.gain.linearRampToValueAtTime(0.1, noteStart + 0.015);
                volume.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.24);
                oscillator.connect(volume);
                volume.connect(audioContext.destination);
                oscillator.start(noteStart);
                oscillator.stop(noteStart + 0.25);
            });
        }

        async function loadPersonalBest() {
            const user = await window.HaygAPI?.getCurrentUser();
            const storageKey = user ? `spelling_best_${user.id}` : "spelling_best_guest";
            let localBest = 0;
            try {
                localBest = Number(localStorage.getItem(storageKey)) || 0;
            } catch (error) {
                console.error("Could not load spelling-game personal best from local storage:", error);
            }

            if (!user || !window.HaygAPI?.getPersonalBest) {
                return { score: localBest, userId: null, storageKey };
            }

            try {
                const savedBest = Number(await window.HaygAPI.getPersonalBest("spelling")) || 0;
                const bestScore = Math.max(localBest, savedBest);
                if (bestScore > localBest) {
                    try {
                        localStorage.setItem(storageKey, String(bestScore));
                    } catch (error) {
                        console.error("Could not cache spelling-game personal best locally:", error);
                    }
                } else if (localBest > savedBest) {
                    await window.HaygAPI.updatePersonalBest("spelling", localBest);
                }
                return {
                    score: bestScore,
                    userId: user.id,
                    storageKey
                };
            } catch (error) {
                console.error("Could not load spelling-game personal best:", error);
                return { score: localBest, userId: user.id, storageKey };
            }
        }

        function showQuestion() {
            if (!running) return;
            if (deck.length === 0) deck = createDeck();
            currentQuestion = deck.shift();
            const pair = categories[currentQuestion.category];
            const answer = currentQuestion.word[currentQuestion.index];
            const alternatives = pair.filter(letter => letter !== answer);
            const choices = shuffled([answer, ...alternatives]);
            const word = currentQuestion.word.toLocaleLowerCase("hy");

            categoryDisplay.textContent = currentQuestion.category;
            const hint = typeof currentQuestion.hint === "string" ? currentQuestion.hint.trim() : "";
            hintTextDisplay.textContent = hint;
            hintDisplay.hidden = !hint;
            questionDisplay.replaceChildren();
            const beforeText = word.slice(0, currentQuestion.index);
            const before = document.createTextNode(beforeText
                ? beforeText[0].toLocaleUpperCase("hy") + beforeText.slice(1)
                : "");
            const missing = document.createElement("span");
            missing.className = "missing-letter";
            missing.textContent = "＿";
            missing.setAttribute("aria-label", "պակասող տառ");
            const after = document.createTextNode(word.slice(currentQuestion.index + 1));
            questionDisplay.append(before, missing, after);
            fitQuestionWord();

            choicesContainer.replaceChildren(...choices.map((letter, index) => {
                const button = document.createElement("button");
                button.className = "spelling-choice";
                button.type = "button";
                const displayedLetter = currentQuestion.index === 0
                    ? letter.toLocaleUpperCase("hy")
                    : letter.toLocaleLowerCase("hy");
                button.textContent = displayedLetter;
                button.setAttribute("aria-label", `Ընտրել ${displayedLetter}`);
                button.dataset.answer = letter;
                button.addEventListener("click", () => answerQuestion(letter));
                button.dataset.shortcut = String(index + 1);
                return button;
            }));
            feedbackDisplay.textContent = "";
            feedbackDisplay.className = "spelling-feedback";
            questionDisplay.classList.remove("answer-correct", "answer-wrong");
            answering = false;
        }

        async function finishGame() {
            if (!running) return;
            running = false;
            clearInterval(ticker);
            ticker = null;
            clearTimeout(answerTimeout);
            answerTimeout = null;
            deadline = 0;
            renderTimer(0);
            choicesContainer.replaceChildren();

            document.getElementById("spelling-final-score").textContent = String(score);
            document.getElementById("spelling-final-correct").textContent = String(correctCount);
            document.getElementById("spelling-final-wrong").textContent = String(wrongCount);
            renderMistakes();
            personalBestCard.classList.remove("is-new-record");
            recordNote.textContent = "";
            resultsOverlay.hidden = false;

            if (saveAttempted) return;
            saveAttempted = true;
            saveStatus.textContent = "Նիշերը կը պահուին…";
            const bestAtStart = await personalBestPromise;
            if (!bestAtStart.userId) {
                const guestBest = Math.max(score, bestAtStart.score);
                personalBestDisplay.textContent = String(guestBest);
                saveStatus.textContent = "";
                if (score > bestAtStart.score) {
                    personalBestCard.classList.add("is-new-record");
                    recordNote.textContent = "Նոր անձնական լաւագոյն։";
                    playRecordSound();
                    try {
                        localStorage.setItem(bestAtStart.storageKey, String(guestBest));
                    } catch (error) {
                        console.error("Could not save spelling-game personal best locally:", error);
                        saveStatus.textContent = "Անձնական լաւագոյնը չյաջողեցաւ պահել սարքին մէջ։";
                    }
                }
                return;
            }

            let personalBestSaveFailed = false;
            personalBestDisplay.textContent = String(bestAtStart.score);
            const isNewRecord = score > bestAtStart.score;
            const personalBest = Math.max(score, bestAtStart.score);
            personalBestDisplay.textContent = String(personalBest);

            if (isNewRecord) {
                personalBestCard.classList.add("is-new-record");
                recordNote.textContent = "Նոր անձնական լաւագոյն։";
                playRecordSound();
                try {
                    localStorage.setItem(bestAtStart.storageKey, String(personalBest));
                } catch (error) {
                    console.error("Could not save spelling-game personal best locally:", error);
                }
                try {
                    await window.HaygAPI.updatePersonalBest("spelling", score);
                } catch (error) {
                    personalBestSaveFailed = true;
                    console.error("Could not save spelling-game personal best:", error);
                }
            }

            if (!scoredRound) {
                saveStatus.textContent = personalBestSaveFailed
                    ? "Անձնական լաւագոյնը չյաջողեցաւ պահել։ Այսօր XP շահելու խաղերդ սպառած են։"
                    : "Այսօր XP շահելու խաղերդ սպառած են։";
                return;
            }

            try {
                const saved = await window.HaygAPI.updateScore("spelling", score, scoredRoundId);
                if (!saved) {
                    saveStatus.textContent = personalBestSaveFailed
                        ? "XP-ն եւ անձնական լաւագոյնը չյաջողեցան պահել։"
                        : "XP-ն չյաջողեցաւ պահել։";
                    return;
                }
                saveStatus.textContent = personalBestSaveFailed
                    ? "XP-ն պահուեցաւ, բայց անձնական լաւագոյնը չյաջողեցաւ պահել։"
                    : "Արդիւնքը պահուեցաւ։";
            } catch (error) {
                console.error("Could not save spelling-game score:", error);
                saveStatus.textContent = "XP-ն չյաջողեցաւ պահել։ Կրնաս կրկին փորձել յետոյ։";
            }
        }

        function updateClock() {
            if (!running) return;
            const remaining = deadline - Date.now();
            renderTimer(remaining);
            if (remaining <= 0) finishGame();
        }

        function answerQuestion(letter) {
            if (!running || answering || Date.now() >= deadline || !currentQuestion) {
                if (running && Date.now() >= deadline) finishGame();
                return;
            }
            answering = true;
            const answer = currentQuestion.word[currentQuestion.index];
            const isCorrect = letter === answer;
            playAnswerSound(isCorrect);
            questionDisplay.classList.remove("answer-correct", "answer-wrong");
            void questionDisplay.offsetWidth;
            questionDisplay.classList.add(isCorrect ? "answer-correct" : "answer-wrong");
            const buttons = [...choicesContainer.querySelectorAll("button")];
            buttons.forEach(button => {
                button.disabled = true;
                if (button.dataset.answer === answer) button.classList.add("is-correct");
                if (button.dataset.answer === letter && !isCorrect) button.classList.add("is-wrong");
            });
            if (isCorrect) {
                correctCount++;
                score += 10;
                showScoreIncrease();
                deadline = Math.min(deadline + 2000, Date.now() + maxTime * 1000);
                showTimerIncrease();
                feedbackDisplay.textContent = "";
                feedbackDisplay.classList.add("is-correct");
            } else {
                wrongCount++;
                mistakes.push({ question: currentQuestion, chosenLetter: letter });
                lives--;
                dropLostHeart();
                feedbackDisplay.textContent = "";
                feedbackDisplay.classList.add("is-wrong");
            }
            renderStats();
            if (lives === 0) {
                finishGame();
                return;
            }
            updateClock();
            if (!running) return;
            const answeredRoundId = roundId;
            answerTimeout = window.setTimeout(() => {
                if (running && answeredRoundId === roundId) showQuestion();
            }, answerDelay);
        }

        function updateDailyCounter(status) {
            if (!status.authenticated) {
                xpCounter.hidden = true;
                xpDescription.hidden = true;
                return;
            }

            xpCounter.hidden = false;
            xpDescription.hidden = false;
            const remaining = Math.min(3, Math.max(0, status.gamesRemaining));
            xpRemaining.textContent = `${remaining}/3`;
            xpCounter.setAttribute("aria-label", `Այսօր XP շահելու ${remaining} խաղ մնացած է`);
            xpCounter.dataset.state = remaining > 0 ? "available" : "exhausted";
        }

        async function showUnavailableCounterForSignedInUser() {
            const user = await window.HaygAPI?.getCurrentUser();
            if (!user) return;

            xpCounter.hidden = false;
            xpDescription.hidden = false;
            xpRemaining.textContent = "—/3";
            xpCounter.setAttribute("aria-label", "XP խաղերու մնացորդը հասանելի չէ");
            xpCounter.dataset.state = "unavailable";
        }

        async function startGame() {
            if (startingRound || running) return;
            startingRound = true;
            unlockAudio();
            startButtons.forEach(button => { button.disabled = true; });

            try {
                const status = await window.HaygAPI?.getSpellingDailyXpStatus(true);
                scoredRound = Boolean(status?.authenticated && status.eligible);
                scoredRoundId = scoredRound ? status.roundId : null;
                if (status) {
                    updateDailyCounter(status);
                } else {
                    await showUnavailableCounterForSignedInUser();
                }
            } catch (error) {
                console.error("Could not reserve spelling-game XP round:", error);
                scoredRound = false;
                scoredRoundId = null;
                await showUnavailableCounterForSignedInUser();
            }

            roundId++;
            clearTimeout(answerTimeout);
            answerTimeout = null;
            score = 0;
            correctCount = 0;
            wrongCount = 0;
            mistakes = [];
            mistakesList.replaceChildren();
            mistakesSection.hidden = true;
            noMistakesMessage.hidden = true;
            lives = startingLives;
            saveAttempted = false;
            deck = createDeck();
            renderStats();
            renderTimer(initialTime * 1000);
            personalBestPromise = loadPersonalBest().catch(error => {
                console.error("Could not load spelling-game personal best:", error);
                return { score: 0, userId: null, storageKey: "spelling_best_guest" };
            });
            personalBestDisplay.textContent = "0";
            personalBestCard.classList.remove("is-new-record");
            recordNote.textContent = "";
            saveStatus.textContent = "";
            introOverlay.hidden = true;
            resultsOverlay.hidden = true;
            running = true;
            deadline = Date.now() + initialTime * 1000;
            showQuestion();
            ticker = window.setInterval(updateClock, 100);
            startingRound = false;
            startButtons.forEach(button => { button.disabled = false; });
        }

        startButtons[0].addEventListener("click", startGame);
        startButtons[1].addEventListener("click", startGame);
        window.addEventListener("resize", fitQuestionWord);
        document.addEventListener("keydown", event => {
            if (!running || answering || (event.key !== "1" && event.key !== "2")) return;
            event.preventDefault();
            const button = choicesContainer.querySelector(`[data-shortcut="${event.key}"]`);
            if (button) button.click();
        });

        if (window.HaygAPI?.getSpellingDailyXpStatus) {
            window.HaygAPI.getSpellingDailyXpStatus().then(status => {
                if (!running && !startingRound) updateDailyCounter(status);
            }).catch(error => {
                console.error("Could not load spelling-game daily XP status:", error);
                showUnavailableCounterForSignedInUser();
            });
        }
    });
})();
