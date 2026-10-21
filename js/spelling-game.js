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

    function validateQuestionBank(questions) {
        if (!Array.isArray(questions) || questions.length === 0) {
            throw new Error("The spelling question bank is empty.");
        }

        const ids = new Set();
        const words = new Set();
        const counts = Object.fromEntries(categoriesInOrder.map(category => [category, 0]));

        for (const question of questions) {
            const pair = categories[question.category];
            if (!pair) throw new Error(`Unknown spelling category: ${question.category}`);
            if (!question.id || ids.has(question.id)) throw new Error(`Missing or duplicate question ID: ${question.id}`);
            if (!question.word || words.has(question.word)) throw new Error(`Missing or duplicate word: ${question.word}`);
            if (!Number.isInteger(question.index) || question.index < 0 || question.index >= question.word.length) {
                throw new Error(`Invalid missing-letter position for ${question.id}`);
            }
            if (question.word[question.index] !== pair[0] && question.word[question.index] !== pair[1]) {
                throw new Error(`Question ${question.id} does not test its assigned category.`);
            }
            ids.add(question.id);
            words.add(question.word);
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
                id: `${category}-${index + 1}`,
                category
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
        const choicesContainer = document.getElementById("spelling-choices");
        const feedbackDisplay = document.getElementById("spelling-feedback");
        const livesDisplay = document.getElementById("spelling-lives");
        const introOverlay = document.getElementById("spelling-intro");
        const resultsOverlay = document.getElementById("spelling-results");
        const saveStatus = document.getElementById("spelling-save-status");
        const personalBestCard = document.getElementById("spelling-personal-best-card");
        const personalBestDisplay = document.getElementById("spelling-final-best");
        const recordNote = document.getElementById("spelling-record-note");
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
            livesDisplay.textContent = `${"♥ ".repeat(lives)}${"♡ ".repeat(startingLives - lives)}`.trim();
            livesDisplay.setAttribute("aria-label", `${lives} կեանք մնաց`);
        }

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

            categoryDisplay.textContent = currentQuestion.category;
            questionDisplay.replaceChildren();
            const before = document.createTextNode(currentQuestion.word.slice(0, currentQuestion.index).toLocaleUpperCase("hy"));
            const missing = document.createElement("span");
            missing.className = "missing-letter";
            missing.textContent = "＿";
            missing.setAttribute("aria-label", "պակասող տառ");
            const after = document.createTextNode(currentQuestion.word.slice(currentQuestion.index + 1).toLocaleUpperCase("hy"));
            questionDisplay.append(before, missing, after);

            choicesContainer.replaceChildren(...choices.map((letter, index) => {
                const button = document.createElement("button");
                button.className = "spelling-choice";
                button.type = "button";
                button.textContent = letter.toLocaleUpperCase("hy");
                button.setAttribute("aria-label", `Ընտրել ${letter}`);
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
                deadline = Math.min(deadline + 2000, Date.now() + maxTime * 1000);
                feedbackDisplay.textContent = "Ճիշդ պատասխան։";
                feedbackDisplay.classList.add("is-correct");
            } else {
                wrongCount++;
                lives--;
                feedbackDisplay.textContent = "Սխալ պատասխան։";
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
