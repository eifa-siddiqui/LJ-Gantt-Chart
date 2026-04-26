jest.mock(
    '@salesforce/apex/DynamicGanttController.getGanttData',
    () => ({
        default: jest.fn().mockResolvedValue([])
    }),
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/DynamicGanttController.getAvailableUsers',
    () => ({
        default: jest.fn().mockResolvedValue([])
    }),
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/DynamicGanttController.getStatusOptions',
    () => ({
        default: jest.fn().mockResolvedValue([])
    }),
    { virtual: true }
);

jest.mock(
    '@salesforce/apex/DynamicGanttController.getOrgToday',
    () => ({
        default: jest.fn().mockResolvedValue('2030-12-15')
    }),
    { virtual: true }
);

import { createElement } from '@lwc/engine-dom';
import GanttChart from 'c/ganttChart';

const flushPromises = () => Promise.resolve().then(() => Promise.resolve());

describe('c-gantt-chart', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        document.body.style.overflow = '';
        jest.clearAllMocks();
    });

    it('exits fullscreen when Escape is pressed', async () => {
        const element = createElement('c-gantt-chart', {
            is: GanttChart
        });

        document.body.appendChild(element);
        await flushPromises();
        await flushPromises();

        const fullscreenButton = element.shadowRoot.querySelector('button[title="Fullscreen"]');
        fullscreenButton.click();
        await flushPromises();
        const wrapper = element.shadowRoot.querySelector('.gantt-wrapper');
        expect(wrapper.classList.contains('is-fullscreen')).toBe(true);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
        await flushPromises();
        const wrapperAfterEscape = element.shadowRoot.querySelector('.gantt-wrapper');

        expect(wrapperAfterEscape.classList.contains('is-fullscreen')).toBe(false);
        expect(document.body.style.overflow).toBe('');
    });

    it('loads the org date from Apex', async () => {
        const element = createElement('c-gantt-chart', {
            is: GanttChart
        });

        document.body.appendChild(element);
        await flushPromises();
        await flushPromises();

        const currentMonthCell = element.shadowRoot.querySelector('.timeline-month-cell.is-current');
        expect(currentMonthCell).not.toBeNull();
        expect(currentMonthCell.textContent).toContain('2030');
    });
});