(() => {
    const client = window.HaygAPI?.getClient();
    if (!client) return;

    const root = document.createElement('div');
    root.id = 'messaging-root';
    root.innerHTML = `
        <div class="message-launcher" id="message-launcher" hidden>
            <button class="message-launch-button" id="message-compose-open" type="button">
                <span aria-hidden="true">✉</span> Հաղորդագրութիւն
            </button>
        </div>
        <div class="message-backdrop" id="message-inbox" hidden>
            <section class="message-dialog" role="dialog" aria-modal="true" aria-labelledby="message-inbox-title">
                <p class="message-eyebrow">Հաղորդագրութիւն</p>
                <h2 id="message-inbox-title">Նոր հաղորդագրութիւն</h2>
                <p class="message-body" id="message-inbox-body"></p>
                <p class="message-status" id="message-inbox-status" aria-live="polite"></p>
                <button class="message-primary-button" id="message-continue" type="button">Շարունակել</button>
            </section>
        </div>
        <div class="message-backdrop" id="message-composer" hidden>
            <section class="message-dialog" role="dialog" aria-modal="true" aria-labelledby="message-composer-title">
                <div class="message-dialog-heading">
                    <div>
                        <p class="message-eyebrow">Կառավարում</p>
                        <h2 id="message-composer-title">Նոր հաղորդագրութիւն</h2>
                    </div>
                    <button class="message-close-button" id="message-compose-close" type="button" aria-label="Փակել">×</button>
                </div>
                <form id="message-compose-form">
                    <label for="message-recipient">Ստացող</label>
                    <select id="message-recipient" required>
                        <option value="all">Բոլոր օգտատէրերը</option>
                    </select>
                    <label for="message-compose-body">Հաղորդագրութիւն</label>
                    <textarea id="message-compose-body" rows="5" maxlength="2000" required></textarea>
                    <p class="message-status" id="message-compose-status" aria-live="polite"></p>
                    <button class="message-primary-button" id="message-send" type="submit">Ուղարկել</button>
                </form>
            </section>
        </div>`;
    document.body.appendChild(root);

    const launcher = root.querySelector('#message-launcher');
    const isMainMenu = Boolean(document.querySelector('.navbar'));
    const inbox = root.querySelector('#message-inbox');
    const inboxBody = root.querySelector('#message-inbox-body');
    const inboxStatus = root.querySelector('#message-inbox-status');
    const continueButton = root.querySelector('#message-continue');
    const composer = root.querySelector('#message-composer');
    const composeForm = root.querySelector('#message-compose-form');
    const recipientSelect = root.querySelector('#message-recipient');
    const composeBody = root.querySelector('#message-compose-body');
    const composeStatus = root.querySelector('#message-compose-status');
    const sendButton = root.querySelector('#message-send');

    let activeUserId = null;
    let pendingMessages = [];

    function displayNextMessage() {
        const message = pendingMessages[0];
        if (!message) {
            inbox.hidden = true;
            return;
        }

        inboxBody.textContent = message.body;
        inboxStatus.textContent = '';
        continueButton.disabled = false;
        inbox.hidden = false;
        continueButton.focus();
    }

    async function loadInbox(userId) {
        const { data, error } = await client.rpc('get_pending_site_messages');
        if (activeUserId !== userId) return;
        if (error) {
            console.error('Could not load messages:', error);
            return;
        }
        pendingMessages = data || [];
        displayNextMessage();
    }

    async function loadRecipients(userId) {
        const { data, error } = await client.rpc('get_site_message_recipients');
        if (activeUserId !== userId) return;
        if (error) {
            console.error('Could not load message recipients:', error);
            launcher.hidden = true;
            return;
        }

        const allUsersOption = document.createElement('option');
        allUsersOption.value = 'all';
        allUsersOption.textContent = 'Բոլոր օգտատէրերը';
        recipientSelect.replaceChildren(allUsersOption);

        for (const user of data || []) {
            const option = document.createElement('option');
            option.value = user.user_id;
            option.textContent = user.full_name || user.user_id;
            recipientSelect.appendChild(option);
        }
    }

    async function loadAdminTools(userId) {
        const { data, error } = await client.rpc('is_site_message_admin');
        if (activeUserId !== userId) return;
        if (error) {
            console.error('Could not verify message admin:', error);
            return;
        }
        launcher.hidden = !data || !isMainMenu;
        if (data) await loadRecipients(userId);
    }

    async function handleSession(session) {
        const userId = session?.user?.id || null;
        if (userId === activeUserId) return;

        activeUserId = userId;
        pendingMessages = [];
        inbox.hidden = true;
        composer.hidden = true;
        launcher.hidden = true;

        if (!userId) return;
        await Promise.all([loadInbox(userId), loadAdminTools(userId)]);
    }

    root.querySelector('#message-compose-open').addEventListener('click', () => {
        composeStatus.textContent = '';
        composer.hidden = false;
        recipientSelect.focus();
    });

    root.querySelector('#message-compose-close').addEventListener('click', () => {
        composer.hidden = true;
    });

    composer.addEventListener('click', (event) => {
        if (event.target === composer) composer.hidden = true;
    });

    continueButton.addEventListener('click', async () => {
        const message = pendingMessages[0];
        if (!message) return;

        continueButton.disabled = true;
        inboxStatus.textContent = '';
        const { error } = await client.rpc('acknowledge_site_message', {
            p_message_id: message.id
        });

        if (error) {
            console.error('Could not acknowledge message:', error);
            inboxStatus.textContent = 'Չյաջողեցաւ պահել։ Խնդրեմ փորձեցէ՛ք կրկին։';
            continueButton.disabled = false;
            return;
        }

        pendingMessages.shift();
        displayNextMessage();
    });

    composeForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        sendButton.disabled = true;
        composeStatus.textContent = '';

        const recipient = recipientSelect.value;
        const { error } = await client.rpc('send_site_message', {
            p_recipient_id: recipient === 'all' ? null : recipient,
            p_body: composeBody.value.trim()
        });

        sendButton.disabled = false;
        if (error) {
            console.error('Could not send message:', error);
            composeStatus.textContent = 'Չյաջողեցաւ ուղարկել հաղորդագրութիւնը։';
            return;
        }

        composeForm.reset();
        composeStatus.textContent = 'Հաղորդագրութիւնը ղրկուեցաւ։';
        if (window.showToast) window.showToast('Հաղորդագրութիւնը ղրկուեցաւ։', 'success');
    });

    client.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(() => handleSession(session), 0);
    });
})();