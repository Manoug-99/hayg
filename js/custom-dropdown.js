(() => {
    let dropdownId = 0;

    function enhance(select) {
        if (select.dataset.customDropdown === 'true' || select.multiple || select.size > 1) return;

        const computedStyle = window.getComputedStyle(select);
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-dropdown';
        wrapper.style.width = computedStyle.width;
        wrapper.style.maxWidth = '100%';
        wrapper.style.margin = computedStyle.margin;

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = `custom-select-trigger ${select.className}`.trim();
        trigger.style.cssText = select.style.cssText;
        trigger.style.setProperty('width', '100%', 'important');
        trigger.style.setProperty('margin', '0', 'important');
        trigger.setAttribute('role', 'combobox');
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        if (select.disabled) trigger.disabled = true;
        if (select.required) trigger.setAttribute('aria-required', 'true');
        if (select.getAttribute('aria-label')) {
            trigger.setAttribute('aria-label', select.getAttribute('aria-label'));
        }
        if (select.getAttribute('aria-describedby')) {
            trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
        }

        const value = document.createElement('span');
        value.className = 'custom-select-value';
        const arrow = document.createElement('span');
        arrow.className = 'custom-select-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        trigger.append(value, arrow);

        const menu = document.createElement('div');
        menu.className = 'custom-select-menu';
        menu.id = `custom-select-menu-${++dropdownId}`;
        menu.setAttribute('role', 'listbox');
        menu.hidden = true;
        trigger.setAttribute('aria-controls', menu.id);

        const label = select.id
            ? document.querySelector(`label[for="${CSS.escape(select.id)}"]`)
            : null;
        if (label) {
            if (!label.id) label.id = `custom-select-label-${dropdownId}`;
            trigger.setAttribute('aria-labelledby', `${label.id} ${value.id || ''}`.trim());
            label.htmlFor = trigger.id || `custom-select-trigger-${dropdownId}`;
            trigger.id = label.htmlFor;
        } else if (!trigger.hasAttribute('aria-label')) {
            trigger.setAttribute('aria-label', select.title || 'Ընտրել');
        }

        value.id = `custom-select-value-${dropdownId}`;
        if (label) trigger.setAttribute('aria-labelledby', `${label.id} ${value.id}`);

        select.dataset.customDropdown = 'true';
        select.classList.add('custom-select-native');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');
        select.before(wrapper);
        wrapper.append(select, trigger, menu);

        let enabledOptions = [];
        let activeIndex = -1;

        function syncSelection() {
            const selected = select.options[select.selectedIndex];
            value.textContent = selected ? selected.textContent : '';
            trigger.disabled = select.disabled;
            menu.replaceChildren();
            enabledOptions = [];

            for (const option of select.options) {
                if (option.hidden) continue;

                const item = document.createElement('div');
                item.className = 'custom-select-option';
                item.id = `${menu.id}-option-${menu.children.length}`;
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', String(option.value === select.value));
                item.textContent = option.textContent;

                if (option.disabled) {
                    item.setAttribute('aria-disabled', 'true');
                } else {
                    enabledOptions.push({ item, option });
                    item.addEventListener('click', () => choose(option));
                    item.addEventListener('pointermove', () => setActive(option));
                }
                menu.appendChild(item);
            }
        }

        function setActive(option) {
            activeIndex = enabledOptions.findIndex(entry => entry.option === option);
            const active = enabledOptions[activeIndex];
            if (!active) return;
            trigger.setAttribute('aria-activedescendant', active.item.id);
            active.item.scrollIntoView({ block: 'nearest' });
        }

        function close(restoreFocus = false) {
            menu.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
            trigger.removeAttribute('aria-activedescendant');
            activeIndex = -1;
            if (restoreFocus) trigger.focus();
        }

        function open(initialIndex = 0) {
            if (trigger.disabled || !enabledOptions.length) return;
            document.querySelectorAll('.custom-select-menu:not([hidden])').forEach(openMenu => {
                if (openMenu !== menu) {
                    const openTrigger = document.querySelector(`[aria-controls="${openMenu.id}"]`);
                    openMenu.hidden = true;
                    openTrigger?.setAttribute('aria-expanded', 'false');
                    openTrigger?.removeAttribute('aria-activedescendant');
                }
            });
            menu.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
            setActive(enabledOptions[Math.max(0, Math.min(initialIndex, enabledOptions.length - 1))].option);
        }

        function choose(option) {
            if (select.value !== option.value) {
                select.value = option.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            syncSelection();
            close(true);
        }

        trigger.addEventListener('click', () => {
            if (menu.hidden) {
                const selectedIndex = enabledOptions.findIndex(entry => entry.option.value === select.value);
                open(selectedIndex < 0 ? 0 : selectedIndex);
            } else {
                close();
            }
        });

        trigger.addEventListener('keydown', event => {
            const isOpen = !menu.hidden;
            if (event.key === 'Escape' && isOpen) {
                event.preventDefault();
                close();
                return;
            }
            if (event.key === 'Tab' && isOpen) {
                close();
                return;
            }

            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const direction = event.key === 'ArrowDown' ? 1 : -1;
                if (!isOpen) {
                    open(direction > 0 ? 0 : enabledOptions.length - 1);
                    return;
                }
                const nextIndex = (activeIndex + direction + enabledOptions.length) % enabledOptions.length;
                setActive(enabledOptions[nextIndex].option);
            } else if (event.key === 'Home' || event.key === 'End') {
                if (!isOpen) return;
                event.preventDefault();
                setActive(enabledOptions[event.key === 'Home' ? 0 : enabledOptions.length - 1].option);
            } else if ((event.key === 'Enter' || event.key === ' ') && isOpen) {
                event.preventDefault();
                const active = enabledOptions[activeIndex];
                if (active) choose(active.option);
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                open();
            }
        });

        select.addEventListener('change', syncSelection);
        new MutationObserver(syncSelection).observe(select, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['disabled', 'hidden', 'selected', 'value']
        });
        syncSelection();
    }

    function enhanceWithin(root) {
        if (root.matches?.('select')) enhance(root);
        root.querySelectorAll?.('select').forEach(enhance);
    }

    document.addEventListener('click', event => {
        document.querySelectorAll('.custom-select-menu:not([hidden])').forEach(menu => {
            if (menu.parentElement.contains(event.target)) return;
            menu.hidden = true;
            const trigger = document.querySelector(`[aria-controls="${menu.id}"]`);
            trigger?.setAttribute('aria-expanded', 'false');
            trigger?.removeAttribute('aria-activedescendant');
        });
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        document.querySelectorAll('.custom-select-menu:not([hidden])').forEach(menu => {
            menu.hidden = true;
            const trigger = document.querySelector(`[aria-controls="${menu.id}"]`);
            trigger?.setAttribute('aria-expanded', 'false');
            trigger?.removeAttribute('aria-activedescendant');
            trigger?.focus();
        });
    });

    window.HaygCustomDropdown = {
        enhance: enhanceWithin,
        focus(select) {
            const wrapper = select.closest('.custom-select-dropdown');
            (wrapper?.querySelector('.custom-select-trigger') || select).focus();
        }
    };

    enhanceWithin(document);
    new MutationObserver(records => {
        for (const record of records) {
            record.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) enhanceWithin(node);
            });
        }
    }).observe(document.body, { childList: true, subtree: true });
})();