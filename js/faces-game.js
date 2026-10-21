const people = [
    { names: ['Քրիստափոր Միքայէլեան', 'Քրիստափոր', 'Միքայէլեան', 'ք'], image: 'pics/faces/christapor.jpg' },
    { names: ['Սիմոն Զաւարեան', 'Սիմոն', 'Զաւարեան', 'ս'], image: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Zavarian.JPG' },
    { names: ['Ստեփան Զօրեան', 'Ստեփան', 'Զօրեան', 'Ռոստոմ', 'ռ'], image: 'pics/faces/rostom.jpg' },
    { names: ['Յարութ Բանոյեան', 'Յարութ', 'բ'], image: 'pics/faces/Բանոյեան-01.jpg' },
    { names: ['Ս'], image: 'pics/img.png' }
];

document.addEventListener("DOMContentLoaded", async () => {
    if (window.HaygAPI) await window.HaygAPI.requireAuth();

    let currentLevel = 0;
    let capsLock = false;
    let audioContext;

    function initAudio() {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
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

    function playCorrectSound() {
        if (!audioContext) initAudio();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.setValueAtTime(523, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(659, audioContext.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(784, audioContext.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    }

    function playWrongSound() {
        if (!audioContext) initAudio();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    }

    function addKeyEffect(keyElement) {
        keyElement.classList.add('key-pressed');
        setTimeout(() => {
            keyElement.classList.remove('key-pressed');
        }, 150);
    }

    function addCorrectEffect() {
        const imageContainer = document.getElementById('image-container');
        imageContainer.classList.add('correct-pop');
        setTimeout(() => {
            imageContainer.classList.remove('correct-pop');
        }, 500);
    }

    function addWrongEffect() {
        const imageContainer = document.getElementById('image-container');
        imageContainer.classList.add('wrong-shake');
        setTimeout(() => {
            imageContainer.classList.remove('wrong-shake');
        }, 500);
    }

    function preloadImage(src) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Image failed to load'));
            image.src = src;
        });
    }

    function loadLevel() {
        if (currentLevel >= people.length) {
            document.getElementById('message').textContent = 'Անցար բոլոր մակարդակները';
            document.getElementById('guess-input').disabled = true;
            document.getElementById('submit-btn').disabled = true;
            window.setGameKeyboardActive?.(false);
            return;
        }
        window.setGameKeyboardActive?.(true);
        const person = people[currentLevel];
        document.getElementById('level').textContent = `${currentLevel + 1} / ${people.length}`;
        document.getElementById('guess-input').value = '';
        document.getElementById('message').textContent = 'Loading image...';
        preloadImage(person.image)
            .then((image) => {
                document.getElementById('person-image').src = image.src;
                document.getElementById('message').textContent = '';
            })
            .catch(() => {
                document.getElementById('person-image').src = person.image;
                document.getElementById('message').textContent = 'Unable to load image. Please try again.';
            });
    }

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    const defaultPlaceholder = 'Գրէ՜ անունը';

    function checkGuess() {
        const guessInput = document.getElementById('guess-input');
        const guess = guessInput.value.trim().toLowerCase();
        const correctNames = people[currentLevel].names.map(name => name.toLowerCase());
        const isCorrect = correctNames.includes(guess);
        if (isCorrect) {
            playCorrectSound();
            addCorrectEffect();
            if (window.HaygAPI) window.HaygAPI.updateScore('faces', 50);
            const nextLevel = currentLevel + 1;
            guessInput.value = '';
            guessInput.placeholder = 'Ճիշդ է';
            document.getElementById('message').textContent = '';
            const nextImageSrc = people[nextLevel] ? people[nextLevel].image : null;
            const preloadPromise = nextImageSrc ? preloadImage(nextImageSrc).catch(() => null) : Promise.resolve(null);
            Promise.all([preloadPromise, wait(2000)]).then(() => {
                guessInput.placeholder = defaultPlaceholder;
                currentLevel = nextLevel;
                loadLevel();
            });
        } else {
            playWrongSound();
            addWrongEffect();
            guessInput.value = '';
            guessInput.placeholder = 'Սխալ է';
            document.getElementById('message').textContent = '';
            wait(2000).then(() => {
                guessInput.placeholder = defaultPlaceholder;
            });
        }
    }

    document.getElementById('submit-btn').addEventListener('click', checkGuess);
    document.getElementById('guess-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            checkGuess();
        }
    });

    loadLevel();

    document.addEventListener('click', initAudio, { once: true });

    const guessInput = document.getElementById('guess-input');
    const keyboardContainer = document.getElementById('keyboard-container');

    // Phonetic keyboard layout matching Wordle
    function initKeyboard() {
        const rows = window.HaygKeyboard.getRows().map(row => [...row]);
        rows[rows.length - 1] = ['␣', ...rows[rows.length - 1], '⌫'];
        keyboardContainer.replaceChildren();
        for (let row of rows) {
            let keyboardRow = document.createElement("div");
            keyboardRow.className = "keyboard-row";
            
            for (let key of row) {
                let button = document.createElement("button");
                button.textContent = key;
                button.setAttribute("data-key", key);
                
                if (key === '␣' || key === '⌫') {
                    button.classList.add("wide-button");
                }
                
                button.addEventListener("click", () => handleKeyPress(key, button));
                keyboardRow.appendChild(button);
            }
            keyboardContainer.appendChild(keyboardRow);
        }
    }

    function handleKeyPress(key, button) {
        playClickSound();

        if (key === '⌫') {
            guessInput.value = guessInput.value.slice(0, -1);
        } else if (key === '␣') {
            guessInput.value += ' ';
        } else {
            guessInput.value += key;
        }
    }

    guessInput.addEventListener('focus', (e) => {
        if (!document.body.classList.contains('native-keyboard-mode')) {
            e.target.blur(); // Prevent mobile native keyboard if virtual mode is active
        }
    });

    window.HaygKeyboard?.onLayoutChange(initKeyboard);
    initKeyboard();
});
