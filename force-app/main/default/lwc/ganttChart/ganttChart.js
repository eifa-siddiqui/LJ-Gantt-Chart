import { LightningElement, api, track } from 'lwc';
import getGanttData from '@salesforce/apex/DynamicGanttController.getGanttData';
import getAvailableUsers from '@salesforce/apex/DynamicGanttController.getAvailableUsers';
import getStatusOptions from '@salesforce/apex/DynamicGanttController.getStatusOptions';
import getOrgToday from '@salesforce/apex/DynamicGanttController.getOrgToday';
import updateRecordFields from '@salesforce/apex/DynamicGanttController.updateRecordFields';

const TIMELINE_CELL_WIDTH_PX = 130;
const DAY_MS = 1000 * 60 * 60 * 24;
const TOOLTIP_WIDTH_PX = 220;
const TOOLTIP_HEIGHT_PX = 150;

export default class DynamicGantt extends LightningElement {
    @api hierarchyLevel;
    @api allObjectsLabel;
    @api chartTitle;
    @api statusColorMap;
    @api recordName;
    @api recordId;

    @api level1Object;
    @api level1DisplayField;
    @api level1StartDate;
    @api level1EndDate;
    @api level1PlannedStartDate;
    @api level1PlannedEndDate;
    @api level1ActualStartDate;
    @api level1ActualEndDate;
    @api level1TargetEndDate;
    @api level1Progress;
    @api level1PopupFields;

    @api level2Object;
    @api level2ParentLookup;
    @api level2SidebarFields;
    @api level2StartDate;
    @api level2EndDate;
    @api level2PlannedStartDate;
    @api level2PlannedEndDate;
    @api level2ActualStartDate;
    @api level2ActualEndDate;
    @api level2TargetEndDate;
    @api level2Progress;
    @api level2PopupFields;

    @api level3Object;
    @api level3ParentLookup;
    @api level3StartDate;
    @api level3EndDate;
    @api level3PlannedStartDate;
    @api level3PlannedEndDate;
    @api level3ActualStartDate;
    @api level3ActualEndDate;
    @api level3TargetEndDate;
    @api level3Progress;
    @api level3PopupFields;

    @track level1Data = [];
    @track timelineMonths = [];
    @track matchCount = 0;
    @track selectedRecordId;
    @track selectedObjectApi;
    @track selectedLevel;
    @track popupFields = [];
    @track isLoading = false;
    @track errorMessage = '';
    @track ownerChoices = [];
    @track statusChoices = [];
    @track tooltip = { visible: false, title: '', details: [], style: '' };

    startDateLimit;
    endDateLimit;
    orgToday;
    searchTerm = '';
    todayLineStyle = '';
    timelineScale = 'months';
    isFullscreen = false;
    statusFilter = 'all';
    ownerFilter = 'all';
    isCurrentRecordScope = false;
    sourceLevel1Data = [];
    @track changeHistory = [];
    @track isSavingChange = false;
    @track dragConfirm = { visible: false };
    suppressBarClick = false;
    dragState = null;
    isEditMode = false;
    inlineEditBaseline = null;
    inlineEditPendingValues = null;

    get allObjectsButtonLabel() {
        return this.allObjectsLabel || 'All Projects';
    }

    get scopeButtonLabel() {
        if (!this.recordId) {
            return this.allObjectsButtonLabel;
        }
        return this.isCurrentRecordScope
            ? this.allObjectsButtonLabel
            : `This ${this._formatObjectLabel(this.level1Object)}`;
    }

    get hierarchyDepth() {
        const raw = (this.hierarchyLevel || '').toString().trim().toLowerCase();
        if (raw === 'no hierarchy') return 0;
        if (raw === '1 level') return 1;
        if (raw === '2 levels') return 2;
        if (raw === '3 levels') return 3;
        const parsed = parseInt(raw, 10);
        return Number.isNaN(parsed) ? 2 : Math.min(Math.max(parsed, 0), 3);
    }

    get supportsLevel2() {
    return this.hierarchyDepth >= 2 
        && !!this.level2Object 
        && !!this.level2ParentLookup;
}

    get supportsLevel3() {
    return this.hierarchyDepth >= 3 
        && !!this.level3Object 
        && !!this.level3ParentLookup;
}

    get disableHierarchyActions() {
        return !this.supportsLevel2 || !this.hasData;
    }

    get wrapperClass() {
        const fullscreenClass = this.isFullscreen ? ' is-fullscreen' : '';
        return `gantt-wrapper scale-${this.timelineScale}${fullscreenClass}`;
    }

    get displayTitle() {
        return (this.chartTitle || '').trim() || this.level1Object || 'Gantt Chart';
    }

    get hasData() {
        return Array.isArray(this.level1Data) && this.level1Data.length > 0;
    }

    get hasSearchTerm() {
        return !!this.searchTerm;
    }

    get searchResultInfo() {
        return `${this.matchCount} match${this.matchCount === 1 ? '' : 'es'}`;
    }

    get hasPopupFields() {
        return Array.isArray(this.popupFields) && this.popupFields.length > 0;
    }

    get selectedRecordSummary() {
        if (!this.selectedRecordId) {
            return [];
        }
        const item = this._findItem(this.selectedRecordId, this.selectedLevel);
        if (!item) {
            return [];
        }
        const record = item.record || {};
        return [
            { key: 'name', label: 'Name', value: record.Name || 'N/A' },
            { key: 'owner', label: 'Owner', value: item.ownerName || record.Owner?.Name || 'N/A' },
            { key: 'status', label: 'Status', value: this._getStatusValue(record, this._getStatusField(this.selectedLevel)) || 'N/A' },
            { key: 'start', label: 'Start', value: this._formatDate(this._getItemStartDate(item, this.selectedLevel)) },
            { key: 'end', label: 'End', value: this._formatDate(this._getItemEndDate(item, this.selectedLevel)) },
            { key: 'duration', label: 'Duration', value: item.duration || 'N/A' }
        ];
    }

    get tooltipVisible() {
        return this.tooltip.visible;
    }

    get tooltipTitle() {
        return this.tooltip.title;
    }

    get tooltipDetails() {
        return this.tooltip.details;
    }

    get tooltipStyle() {
        return this.tooltip.style;
    }

    get projectEndLineStyle() {
        return 'display:none;';
    }

    get hierarchyButtonLabel() {
        return this._hasExpandedRows(this.sourceLevel1Data) ? 'Collapse All' : 'Expand All';
    }

    get disableUndo() {
        return this.changeHistory.length === 0 || this.isSavingChange;
    }

    get disableEditButton() {
        return !this.selectedRecordId || !this.selectedObjectApi;
    }

    get hasEditFields() {
        return this.editFieldList.length > 0;
    }

    get editFieldList() {
        const level = this.selectedLevel || 1;
        const configuredFields = this.hasPopupFields ? this.popupFields : [];
        const combined = [
            'Name',
            'OwnerId',
            this._getActualStartField(level),
            this._getActualEndField(level),
            this._getStatusField(level),
            ...configuredFields
        ].filter(Boolean);
        return [...new Set(combined)];
    }

    get modalTitle() {
        if (!this.selectedRecordId) return '';
        const record = this._findRecord(this.selectedRecordId);
        return record ? record.Name : 'Record Details';
    }

    get modalLevelLabel() {
        return this.selectedLevel ? `Level ${this.selectedLevel}` : '';
    }

    get scaleOptions() {
        return [
            { label: 'Years', value: 'years' },
            { label: 'Quarters', value: 'quarters' },
            { label: 'Months', value: 'months' },
            { label: 'Weeks', value: 'weeks' },
            { label: 'Days', value: 'days' }
        ];
    }

    get scaleSelectOptions() {
        return this.scaleOptions.map((option) => ({
            ...option,
            selected: option.value === this.timelineScale
        }));
    }

    get fullscreenLabel() {
        return this.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
    }

    get fullscreenButtonSymbol() {
        return this.isFullscreen ? '[-]' : '[+]';
    }

    get statusOptions() {
        return [{ label: 'All Statuses', value: 'all' }, ...this.statusChoices];
    }

    get statusSelectOptions() {
        return this.statusOptions.map((option) => ({
            ...option,
            selected: option.value === this.statusFilter
        }));
    }

    get ownerOptions() {
        return [{ label: 'All Owners', value: 'all' }, ...this.ownerChoices];
    }

    get ownerSelectOptions() {
        return this.ownerOptions.map((option) => ({
            ...option,
            selected: option.value === this.ownerFilter
        }));
    }

    get timelineUnitWidthPx() {
        if (this.timelineScale === 'years') return 190;
        if (this.timelineScale === 'quarters') return 150;
        if (this.timelineScale === 'weeks') return 112;
        if (this.timelineScale === 'days') return 84;
        return TIMELINE_CELL_WIDTH_PX;
    }

    get timelineBodyStyle() {
        const width = Math.max(this.timelineMonths.length * this.timelineUnitWidthPx, this.timelineUnitWidthPx);
        return `width:${width}px; min-width:${width}px;`;
    }

    get todayLabel() {
        const today = this._getCurrentDate();
        return `TODAY ${today.toLocaleDateString('en-GB')}`;
    }

    scrollToToday() {
        const timeline = this.template.querySelector('.timeline-body-viewport');
        const header = this.template.querySelector('.timeline-header-scroll');
        if (!timeline || !this.startDateLimit || !this.endDateLimit) {
            return;
        }
        const total = this.endDateLimit.getTime() - this.startDateLimit.getTime();
        if (total <= 0) {
            return;
        }
        const currentDate = this._getCurrentDate();
        const ratio = Math.max(0, Math.min(1, (currentDate.getTime() - this.startDateLimit.getTime()) / total));
        const totalWidth = this.timelineMonths.length * this.timelineUnitWidthPx;
        const left = Math.max(0, ratio * totalWidth - timeline.clientWidth / 2);
        timeline.scrollLeft = left;
        if (header) {
            header.scrollLeft = left;
        }
    }

    connectedCallback() {
        this._fullscreenHandler = this.handleFullscreenChange.bind(this);
        this._resizeHandler = this.handleWindowResize.bind(this);
        this._keydownHandler = this.handleDocumentKeyDown.bind(this);
        this._dragMoveHandler = this.handleBarDragMove.bind(this);
        this._dragEndHandler = this.handleBarDragEnd.bind(this);
        document.addEventListener('fullscreenchange', this._fullscreenHandler);
        document.addEventListener('keydown', this._keydownHandler);
        document.addEventListener('mousemove', this._dragMoveHandler);
        document.addEventListener('mouseup', this._dragEndHandler);
        window.addEventListener('resize', this._resizeHandler);

        this.isCurrentRecordScope = !!this.recordId;
        this.initTimeline();
        this.loadOrgToday();
        this.loadOwners();
        this.loadStatusOptions();
        this.loadLevel1();
    }

    disconnectedCallback() {
        if (this._fullscreenHandler) {
            document.removeEventListener('fullscreenchange', this._fullscreenHandler);
        }
        if (this._keydownHandler) {
            document.removeEventListener('keydown', this._keydownHandler);
        }
        if (this._dragMoveHandler) {
            document.removeEventListener('mousemove', this._dragMoveHandler);
        }
        if (this._dragEndHandler) {
            document.removeEventListener('mouseup', this._dragEndHandler);
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
    }

    handleDocumentKeyDown(event) {
        if ((event.key || event.code) === 'Escape' && this.isFullscreen) {
            event.preventDefault();
            this._exitFullscreen();
        }
    }

    handleWindowResize() {
        this.initTimeline();
    }

    loadOwners() {
        getAvailableUsers()
            .then((result) => {
                this.ownerChoices = (result || [])
                    .map((user) => ({
                        label: user.label,
                        value: user.value
                    }))
                    .filter((user) => {
                        const value = (user.value || '').toLowerCase();
                        const label = (user.label || '').toLowerCase();
                        return value !== 'all' && !label.includes('all assignee') && !label.includes('all owner');
                    });
            })
            .catch(() => {
                this.ownerChoices = [];
            });
    }

    loadStatusOptions() {
        getStatusOptions({
            objectName: this.supportsLevel2 ? this.level2Object || this.level1Object : this.level1Object,
            statusField: this.supportsLevel2 ? this.level2Progress || this.level1Progress : this.level1Progress
        })
            .then((result) => {
                this.statusChoices = (result || []).map((option) => ({
                    label: option.label,
                    value: option.value
                }));
            })
            .catch(() => {
                this.statusChoices = [];
            });
    }

    loadOrgToday() {
        return getOrgToday()
            .then((result) => {
                this.orgToday = this._parseApexDate(result) || new Date();
                this.initTimeline();
            })
            .catch(() => {
                this.orgToday = null;
                this.initTimeline();
            });
    }

    initTimeline() {
        const today = this._getCurrentDate();
        const start = this._getTimelineStart(today);
        const horizon = this._getTimelineHorizonDate();
        const totalUnits = Math.max(this._getScaleUnitCount(), this._getRequiredScaleUnits(start, horizon));
        this.startDateLimit = new Date(start);

        const timelineEndDate = this._addScaleUnits(start, totalUnits);
        const denominator = timelineEndDate.getTime() - start.getTime();
        if (denominator <= 0) {
            this.todayLineStyle = 'display:none;';
        } else {
            const todayOffsetPct = ((today.getTime() - start.getTime()) / denominator) * 100;
            this.todayLineStyle = `left:${Math.max(0, Math.min(100, todayOffsetPct)).toFixed(2)}%; display:block;`;
        }

        this.timelineMonths = Array.from({ length: totalUnits }, (_, index) => {
            const date = this._addScaleUnits(start, index);
            return {
                label: this._formatScaleLabel(date),
                timestamp: date.getTime(),
                cellClass: this._isCurrentUnit(date, today)
                    ? 'timeline-month-cell is-current'
                    : 'timeline-month-cell'
            };
        });

        this.endDateLimit = timelineEndDate;
        this._refreshBarsForCurrentScale();
    }

    loadLevel1() {
        if (!this.level1Object) {
            this.errorMessage = 'Level 1 Object is not configured. Please set it in component properties.';
            return;
        }

        this.isLoading = true;
        this.errorMessage = '';

        const fields = [
            this.level1DisplayField,
            this.level1StartDate,
            this.level1EndDate,
            this.level1PlannedStartDate,
            this.level1PlannedEndDate,
            this.level1ActualStartDate,
            this.level1ActualEndDate,
            this.level1TargetEndDate,
            this.level1Progress
        ]
            .filter(Boolean)
            .join(',');

        getGanttData({
            objectName: this.level1Object,
            fields,
            lookupField: '',
            parentId: '',
            statusField: this.level1Progress || '',
            startDateField: this.level1StartDate || '',
            searchTerm: '',
            specificRecordId: this.isCurrentRecordScope ? this.recordId : ''
        })
            .then((result) => {
                this.sourceLevel1Data = (result || []).map((item) => this._wrapL1(item));
                this._refreshView();

                if (this.supportsLevel2 && this.sourceLevel1Data.length && this._validateL2Config()) {
                    this.expandAll();
                } else {
                    this.initTimeline();
                    this.isLoading = false;
                }
            })
            .catch((error) => {
                this.errorMessage = `Error loading Level 1: ${this._msg(error)}`;
                this.isLoading = false;
            });
    }

    _loadLevel2(parentId) {
        const fields = [
            this.level2SidebarFields,
            this.level2PopupFields,
            this.level2StartDate,
            this.level2EndDate,
            this.level2PlannedStartDate,
            this.level2PlannedEndDate,
            this.level2ActualStartDate,
            this.level2ActualEndDate,
            this.level2TargetEndDate,
            this.level2Progress
        ]
            .filter(Boolean)
            .join(',');

        return getGanttData({
            objectName: this.level2Object,
            fields,
            lookupField: this.level2ParentLookup,
            parentId,
            statusField: this.level2Progress || '',
            startDateField: this.level2StartDate || '',
            searchTerm: '',
            specificRecordId: ''
        }).then((result) => (result || []).map((child) => this._wrapChild(child, 2)));
    }

    _loadLevel3(parentId) {
        const fields = [
            this.level3PopupFields,
            this.level3StartDate,
            this.level3EndDate,
            this.level3PlannedStartDate,
            this.level3PlannedEndDate,
            this.level3ActualStartDate,
            this.level3ActualEndDate,
            this.level3TargetEndDate,
            this.level3Progress
        ]
            .filter(Boolean)
            .join(',');

        return getGanttData({
            objectName: this.level3Object,
            fields,
            lookupField: this.level3ParentLookup,
            parentId,
            statusField: this.level3Progress || '',
            startDateField: this.level3StartDate || '',
            searchTerm: '',
            specificRecordId: ''
        }).then((result) => (result || []).map((child) => this._wrapChild(child, 3)));
    }

    _wrapL1(item) {
        const plannedStartDate = this._getPlannedStartDate(item.record, 1);
        const plannedEndDate = this._getPlannedEndDate(item.record, 1);
        const actualStartDate = this._getActualStartDate(item.record, 1);
        const actualEndDate = this._getActualEndDate(item.record, 1);
        const targetEndDate = this._getTargetEndDate(item.record, 1);
        const statusValue = this._getStatusValue(item.record, this.level1Progress);
        const progress = Math.min(Math.max(item.progress || 0, 0), 100);
        return {
            ...item,
            _l2Loaded: false,
            expanded: false,
            rowClass: 'l1-item',
            iconClass: 'expand-icon',
            children: [],
            duration: this.calculateDuration(actualStartDate, actualEndDate),
            plannedBarStyle: this.calculateBarStyle(plannedStartDate, plannedEndDate),
            barStyle: this.calculateBarStyle(actualStartDate, actualEndDate),
            targetEndStyle: this.calculateTargetMarkerStyle(targetEndDate),
            barClass: 'gantt-bar-item actual-bar-item',
            progressStyle: `width: ${progress}%;`,
            progressLabel: item.record.Name || '',
            fillClass: this._barFillClass(statusValue, progress),
            hoverText: this._buildHoverText(
                item.record,
                1,
                statusValue,
                actualStartDate,
                actualEndDate,
                this.calculateDuration(actualStartDate, actualEndDate),
                progress
            ),
            ownerName: item.record?.Owner?.Name || '',
            ownerId: item.record?.OwnerId || ''
        };
    }

    _wrapChild(child, level) {
        const statusField = level === 2 ? this.level2Progress : this.level3Progress;
        const plannedStartDate = this._getPlannedStartDate(child.record, level);
        const plannedEndDate = this._getPlannedEndDate(child.record, level);
        const actualStartDate = this._getActualStartDate(child.record, level);
        const actualEndDate = this._getActualEndDate(child.record, level);
        const targetEndDate = this._getTargetEndDate(child.record, level);
        const progress = Math.min(Math.max(child.progress || 0, 0), 100);
        const statusValue = this._getStatusValue(child.record, statusField);
        const duration = this.calculateDuration(actualStartDate, actualEndDate);

        return {
            ...child,
            expanded: false,
            rowClass: level === 2 ? 'l2-row' : 'l3-row',
            iconClass: 'expand-icon',
            duration,
            plannedBarStyle: this.calculateBarStyle(plannedStartDate, plannedEndDate),
            barStyle: this.calculateBarStyle(actualStartDate, actualEndDate),
            targetEndStyle: this.calculateTargetMarkerStyle(targetEndDate),
            barClass: level === 2 ? 'gantt-bar-item actual-bar-item' : 'gantt-bar-item l3-bar actual-bar-item',
            progressStyle: `width: ${progress}%;`,
            progressLabel: '',
            fillClass: this._barFillClass(statusValue, progress),
            hoverText: this._buildHoverText(child.record, level, statusValue, actualStartDate, actualEndDate, duration, progress),
            children: [],
            ownerName: child.record?.Owner?.Name || '',
            ownerId: child.record?.OwnerId || ''
        };
    }

    _barFillClass(statusValue, progress) {
        const normalizedStatus = (statusValue || '').toLowerCase();
        const customTone = this._getConfiguredTone(normalizedStatus);
        if (customTone) {
            return `gantt-bar-fill status-${customTone}`;
        }
        if (!normalizedStatus) {
            return 'gantt-bar-fill status-na';
        }
        if (normalizedStatus.includes('complete') || normalizedStatus.includes('completed') || normalizedStatus.includes('done') || normalizedStatus.includes('closed') || normalizedStatus.includes('finished') || normalizedStatus.includes('resolved') || normalizedStatus.includes('approved')) {
            return 'gantt-bar-fill status-complete';
        }
        if (normalizedStatus.includes('pending')) {
            return 'gantt-bar-fill status-pending';
        }
        if (normalizedStatus.includes('new')) {
            return 'gantt-bar-fill status-not-started';
        }
        if (normalizedStatus.includes('hold') || normalizedStatus.includes('risk') || normalizedStatus.includes('blocked') || normalizedStatus.includes('delay') || normalizedStatus.includes('on hold') || normalizedStatus.includes('stopped') || normalizedStatus.includes('cancelled') || normalizedStatus.includes('canceled') || normalizedStatus.includes('waiting')) {
            return 'gantt-bar-fill status-pending';
        }
        if (normalizedStatus.includes('not') || normalizedStatus.includes('plan') || normalizedStatus.includes('open') || normalizedStatus.includes('todo') || normalizedStatus.includes('draft') || normalizedStatus.includes('queued')) {
            return 'gantt-bar-fill status-not-started';
        }
        if (progress >= 100) {
            return 'gantt-bar-fill status-complete';
        }
        return progress > 0 ? 'gantt-bar-fill status-pending' : 'gantt-bar-fill status-na';
    }

    toggleLevel1(event) {
        if (!this.supportsLevel2) return;
        if (!this._validateL2Config()) return;

        const id = event.currentTarget.dataset.id;
        const index = this.sourceLevel1Data.findIndex((item) => item.record.Id === id);
        if (index === -1) return;

        const item = this.sourceLevel1Data[index];
        if (item.expanded) {
            this._updateSourceLevel1(index, {
                ...item,
                expanded: false,
                rowClass: 'l1-item',
                iconClass: 'expand-icon'
            });
            this._refreshView();
            return;
        }

        if (item._l2Loaded || (item.children && item.children.length > 0)) {
            this._updateSourceLevel1(index, {
                ...item,
                expanded: true,
                rowClass: 'l1-item expanded-row',
                iconClass: 'expand-icon open'
            });
            this._refreshView();
            return;
        }

        this.isLoading = true;
        this._loadLevel2(id)
            .then((children) => {
                this._updateSourceLevel1(index, {
                    ...item,
                    _l2Loaded: true,
                    children,
                    expanded: true,
                    rowClass: 'l1-item expanded-row',
                    iconClass: 'expand-icon open'
                });
                this._refreshView();
                this.isLoading = false;
            })
            .catch((error) => {
                this.errorMessage = `Error loading Level 2: ${this._msg(error)}`;
                this.isLoading = false;
            });
    }

    handleLevel2Toggle(event) {
        if (!this.supportsLevel3 || !this.level3Object || !this.level3ParentLookup) {
            return;
        }

        const l2Id = event.currentTarget.dataset.id;
        const l1Id = event.currentTarget.dataset.parent;
        const l1Index = this.sourceLevel1Data.findIndex((item) => item.record.Id === l1Id);
        if (l1Index === -1) return;

        const l1Item = this.sourceLevel1Data[l1Index];
        const l2Index = (l1Item.children || []).findIndex((item) => item.record.Id === l2Id);
        if (l2Index === -1) return;

        const l2Item = l1Item.children[l2Index];
        if (l2Item.expanded) {
            this._updateSourceL2(l1Index, l2Index, {
                ...l2Item,
                expanded: false,
                rowClass: 'l2-row',
                iconClass: 'expand-icon'
            });
            this._refreshView();
            return;
        }

        if (l2Item.children && l2Item.children.length > 0) {
            this._updateSourceL2(l1Index, l2Index, {
                ...l2Item,
                expanded: true,
                rowClass: 'l2-row expanded-row',
                iconClass: 'expand-icon open'
            });
            this._refreshView();
            return;
        }

        this.isLoading = true;
        this._loadLevel3(l2Id)
            .then((children) => {
                this._updateSourceL2(l1Index, l2Index, {
                    ...l2Item,
                    children,
                    expanded: true,
                    rowClass: 'l2-row expanded-row',
                    iconClass: 'expand-icon open'
                });
                this._refreshView();
                this.isLoading = false;
            })
            .catch((error) => {
                this.errorMessage = `Error loading Level 3: ${this._msg(error)}`;
                this.isLoading = false;
            });
    }

    _updateSourceLevel1(index, updatedItem) {
        const updated = [...this.sourceLevel1Data];
        updated[index] = updatedItem;
        this.sourceLevel1Data = updated;
    }

    _updateSourceL2(l1Index, l2Index, updatedL2) {
        const updated = [...this.sourceLevel1Data];
        const children = [...updated[l1Index].children];
        children[l2Index] = updatedL2;
        updated[l1Index] = { ...updated[l1Index], children };
        this.sourceLevel1Data = updated;
    }

    handleLevel1Click(event) {
        if (this.suppressBarClick) {
            this.suppressBarClick = false;
            return;
        }
        event.stopPropagation();
        this.selectedRecordId = event.currentTarget.dataset.id;
        this.selectedObjectApi = this.level1Object;
        this.selectedLevel = 1;
        this.popupFields = this._parseFields(this.level1PopupFields);
        this.isEditMode = false;
    }

    handleItemClick(event) {
        if (this.suppressBarClick) {
            this.suppressBarClick = false;
            return;
        }
        event.stopPropagation();
        const id = event.currentTarget.dataset.id;
        const level = parseInt(event.currentTarget.dataset.level, 10);
        this.selectedRecordId = id;
        this.selectedLevel = level;
        this.selectedObjectApi = level === 3 ? this.level3Object : this.level2Object;
        this.popupFields = this._parseFields(level === 3 ? this.level3PopupFields : this.level2PopupFields);
        this.isEditMode = false;
    }

    handleBarDragStart(event) {
        if (event.button !== 0 || this.isSavingChange) {
            return;
        }

        const id = event.currentTarget.dataset.id;
        const level = parseInt(event.currentTarget.dataset.level || '1', 10);
        const item = this._findItem(id, level);
        if (!item || !this.startDateLimit || !this.endDateLimit) {
            return;
        }

        const originalDates = this._buildShiftedDatesForItem(item.record, level, 0);
        if (!originalDates.actualStart) {
            return;
        }

        const pxPerDay = this._getPixelsPerDay();
        if (pxPerDay <= 0) {
            return;
        }

        this.dragState = {
            id,
            level,
            objectApi: this._getObjectApiByLevel(level),
            startX: event.clientX,
            movedDays: 0,
            didDrag: false,
            pxPerDay,
            originalDates
        };
        event.preventDefault();
    }

    handleBarDragMove(event) {
        if (!this.dragState) {
            return;
        }

        const dayOffset = Math.round((event.clientX - this.dragState.startX) / this.dragState.pxPerDay);
        if (dayOffset === this.dragState.movedDays) {
            return;
        }

        this.dragState.movedDays = dayOffset;
        this.dragState.didDrag = true;
        this._applyDragPreview(this.dragState.id, this.dragState.level, dayOffset);
    }

    async handleBarDragEnd() {
        if (!this.dragState) {
            return;
        }

        const drag = this.dragState;
        this.dragState = null;

        if (!drag.didDrag) {
            return;
        }

        this.suppressBarClick = true;
        if (drag.movedDays === 0) {
            this._refreshBarsForCurrentScale();
            return;
        }

        this._openDragConfirm(drag);
    }

    _openDragConfirm(drag) {
        const item = this._findItem(drag.id, drag.level);
        if (!item) {
            this._refreshBarsForCurrentScale();
            return;
        }

        const shiftedDates = this._buildShiftedDatesForItem(item.record, drag.level, drag.movedDays);
        const before = this._buildFieldValueMapFromDates(drag.level, drag.originalDates);
        const after = this._buildFieldValueMapFromDates(drag.level, shiftedDates);

        this.dragConfirm = {
            visible: true,
            id: drag.id,
            level: drag.level,
            objectApi: drag.objectApi,
            movedDays: drag.movedDays,
            itemLabel: item.record?.Name || 'Record',
            before,
            after,
            changes: [
                {
                    key: 'start',
                    label: 'Start',
                    before: this._formatDate(drag.originalDates.actualStart),
                    after: this._formatDate(shiftedDates.actualStart)
                },
                {
                    key: 'end',
                    label: 'End',
                    before: this._formatDate(drag.originalDates.actualEnd),
                    after: this._formatDate(shiftedDates.actualEnd)
                }
            ]
        };
    }

    confirmDragShift() {
        if (!this.dragConfirm?.visible) {
            return;
        }

        const drag = { ...this.dragConfirm };
        this.dragConfirm = { visible: false };
        this._commitDragShift(drag);
    }

    cancelDragConfirm() {
        this.dragConfirm = { visible: false };
        this._refreshBarsForCurrentScale();
    }

    openEditRecord() {
        if (!this.selectedObjectApi || !this.selectedRecordId) {
            return;
        }
        const item = this._findItem(this.selectedRecordId, this.selectedLevel);
        const before = {};
        if (item?.record) {
            this.editFieldList.forEach((fieldName) => {
                const fieldValue = item.record[fieldName];
                if (fieldValue instanceof Date) {
                    before[fieldName] = this._formatDateForApex(fieldValue);
                } else {
                    before[fieldName] = fieldValue;
                }
            });
        }
        this.inlineEditBaseline = {
            objectApi: this.selectedObjectApi,
            recordId: this.selectedRecordId,
            level: this.selectedLevel,
            before
        };
        this.inlineEditPendingValues = null;
        this.isEditMode = true;
    }

    cancelInlineEdit() {
        this.isEditMode = false;
        this.inlineEditPendingValues = null;
    }

    saveInlineEdit() {
        const form = this.template.querySelector('.modal-edit-form');
        if (form) {
            form.submit();
        }
    }

    handleInlineEditSubmit(event) {
        event.preventDefault();
        const fields = { ...(event.detail?.fields || {}) };
        const values = {};
        Object.keys(fields).forEach((fieldName) => {
            const raw = fields[fieldName];
            values[fieldName] = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
        });
        this.inlineEditPendingValues = values;

        const form = this.template.querySelector('.modal-edit-form');
        if (form) {
            form.submit(fields);
        }
    }

    handleInlineEditSuccess() {
        const baseline = this.inlineEditBaseline;
        const after = this.inlineEditPendingValues || {};
        if (baseline && Object.keys(after).length) {
            this.changeHistory = [
                ...this.changeHistory,
                {
                    objectApi: baseline.objectApi,
                    recordId: baseline.recordId,
                    level: baseline.level,
                    before: baseline.before,
                    after
                }
            ];
            this._applyRecordFieldValues(baseline.recordId, baseline.level, after);
            this._refreshView();
        }
        this.isEditMode = false;
        this.inlineEditPendingValues = null;
        this.reloadChart();
    }

    handleInlineEditError(event) {
        const message = event?.detail?.message || 'Failed to save record changes.';
        this.errorMessage = message;
    }

    undoLastChange() {
        if (this.disableUndo) {
            return;
        }

        const lastChange = this.changeHistory[this.changeHistory.length - 1];
        this.isSavingChange = true;
        updateRecordFields({
            objectName: lastChange.objectApi,
            recordId: lastChange.recordId,
            fieldValues: lastChange.before
        })
            .then(() => {
                this.changeHistory = this.changeHistory.slice(0, -1);
                this._applyRecordFieldValues(lastChange.recordId, lastChange.level, lastChange.before);
                this._refreshView();
                this.reloadChart();
            })
            .catch((error) => {
                this.errorMessage = `Undo failed: ${this._msg(error)}`;
            })
            .finally(() => {
                this.isSavingChange = false;
            });
    }

    closeModal() {
        this.selectedRecordId = null;
        this.isEditMode = false;
        this.inlineEditBaseline = null;
        this.inlineEditPendingValues = null;
    }

    handleBackdropClick() {
        this.closeModal();
    }

    stopPropagation(event) {
        event.stopPropagation();
    }

    handleSearchInput(event) {
        this._applySearch((event.target.value || '').trim());
    }

    handleSearchClear() {
        this._applySearch('');
    }

    handleBarHover(event) {
        const id = event.currentTarget.dataset.id;
        const level = parseInt(event.currentTarget.dataset.level || '1', 10);
        const item = this._findItem(id, level);
        if (!item) {
            return;
        }

        const details = [
            { key: 'status', label: 'Status', value: this._getStatusValue(item.record, this._getStatusField(level)) || 'N/A' },
            { key: 'start', label: 'Start', value: this._formatDate(this._getItemStartDate(item, level)) },
            { key: 'end', label: 'End', value: this._formatDate(this._getItemEndDate(item, level)) },
            { key: 'duration', label: 'Duration', value: item.duration || 'N/A' },
            { key: 'owner', label: 'Owner', value: item.ownerName || 'N/A' }
        ];

        this.tooltip = {
            visible: true,
            title: item.record?.Name || 'Record',
            details,
            style: this._buildTooltipStyle(event)
        };
    }

    handleBarMove(event) {
        if (!this.tooltip.visible) {
            return;
        }
        this.tooltip = {
            ...this.tooltip,
            style: this._buildTooltipStyle(event)
        };
    }

    handleTargetHover(event) {
        event.stopPropagation();
        const id = event.currentTarget.dataset.id;
        const level = parseInt(event.currentTarget.dataset.level || '1', 10);
        const item = this._findItem(id, level);
        if (!item) {
            return;
        }

        const targetEnd = this._getTargetEndDate(item.record, level);
        this.tooltip = {
            visible: true,
            title: item.record?.Name || 'Record',
            details: [
                { key: 'targetEnd', label: 'Target End', value: this._formatDate(targetEnd) }
            ],
            style: this._buildTooltipStyle(event)
        };
    }

    handleTargetMove(event) {
        event.stopPropagation();
        if (!this.tooltip.visible) {
            return;
        }
        this.tooltip = {
            ...this.tooltip,
            style: this._buildTooltipStyle(event)
        };
    }

    hideTooltip() {
        if (this.tooltip.visible) {
            this.tooltip = { visible: false, title: '', details: [], style: '' };
        }
    }

    _applySearch(term) {
        this.searchTerm = (term || '').toLowerCase();
        this._prepareHierarchyForQuery()
            .then(() => {
                this._refreshView();
            })
            .catch(() => {
                this._refreshView();
            });
    }

    handleStatusFilterChange(event) {
        this.statusFilter = event.detail?.value || event.target?.value || 'all';
        this._refreshView();
        this.initTimeline();
    }

    handleOwnerFilterChange(event) {
        this.ownerFilter = event.detail?.value || event.target?.value || 'all';
        this._refreshView();
        this.initTimeline();
    }

    toggleExpandCollapseAll() {
        if (this._hasExpandedRows(this.sourceLevel1Data)) {
            this.collapseAll();
        } else {
            this.expandAll();
        }
    }

    toggleScope() {
        if (!this.recordId) {
            return;
        }
        this.isCurrentRecordScope = !this.isCurrentRecordScope;
        this.reloadChart();
    }

    syncScroll(event) {
        const sidebar = this.template.querySelector('.gantt-table-body');
        const header = this.template.querySelector('.timeline-header-scroll');
        if (sidebar && sidebar.scrollTop !== event.target.scrollTop) {
            sidebar.scrollTop = event.target.scrollTop;
        }
        if (header && header.scrollLeft !== event.target.scrollLeft) {
            header.scrollLeft = event.target.scrollLeft;
        }
    }

    syncSidebarScroll(event) {
        const timeline = this.template.querySelector('.timeline-body-viewport');
        if (timeline && timeline.scrollTop !== event.target.scrollTop) {
            timeline.scrollTop = event.target.scrollTop;
        }
    }

    collapseAll() {
        if (!this.supportsLevel2 || !this.sourceLevel1Data.length) return;
        this.sourceLevel1Data = this.sourceLevel1Data.map((item) => ({
            ...item,
            expanded: false,
            rowClass: 'l1-item',
            iconClass: 'expand-icon',
            children: (item.children || []).map((child) => ({
                ...child,
                expanded: false,
                rowClass: 'l2-row',
                iconClass: 'expand-icon'
            }))
        }));
        this._refreshView();
    }

    expandAll() {
        if (!this.supportsLevel2 || !this.sourceLevel1Data.length) return;
        if (!this._validateL2Config()) return;

        this.isLoading = true;
        const loads = this.sourceLevel1Data.map((item, index) => {
            if (item._l2Loaded || (item.children && item.children.length > 0)) {
                const updated = [...this.sourceLevel1Data];
                updated[index] = {
                    ...updated[index],
                    expanded: true,
                    rowClass: 'l1-item expanded-row',
                    iconClass: 'expand-icon open'
                };
                this.sourceLevel1Data = updated;
                return Promise.resolve();
            }
            return this._loadLevel2(item.record.Id).then((children) => {
                const updated = [...this.sourceLevel1Data];
                updated[index] = {
                    ...updated[index],
                    _l2Loaded: true,
                    children,
                    expanded: true,
                    rowClass: 'l1-item expanded-row',
                    iconClass: 'expand-icon open'
                };
                this.sourceLevel1Data = updated;
            });
        });

        Promise.all(loads)
            .then(() => {
                this._refreshView();
                this.isLoading = false;
            })
            .catch((error) => {
                this.errorMessage = `Expand all error: ${this._msg(error)}`;
                this.isLoading = false;
            });
    }

    async _prepareHierarchyForQuery() {
        if (!this.supportsLevel2 || !this._hasActiveQuery() || !this.sourceLevel1Data.length) {
            return;
        }
        if (!this._validateL2Config()) {
            return;
        }

        this.isLoading = true;
        try {
            const loads = this.sourceLevel1Data.map((item, index) => {
                if (item._l2Loaded || (item.children && item.children.length > 0)) {
                    return Promise.resolve();
                }
                return this._loadLevel2(item.record.Id).then((children) => {
                    const updated = [...this.sourceLevel1Data];
                    updated[index] = {
                        ...updated[index],
                        _l2Loaded: true,
                        children
                    };
                    this.sourceLevel1Data = updated;
                });
            });
            await Promise.all(loads);
        } finally {
            this.isLoading = false;
        }
    }

    _hasActiveQuery() {
        return !!this.searchTerm || this.statusFilter !== 'all' || this.ownerFilter !== 'all';
    }

    reloadChart() {
        this.level1Data = [];
        this.sourceLevel1Data = [];
        this.errorMessage = '';
        this.matchCount = 0;
        this.tooltip = { visible: false, title: '', details: [], style: '' };
        this.isLoading = true;
        this.initTimeline();
        this.loadOrgToday();
        this.loadOwners();
        this.loadStatusOptions();
        this.loadLevel1();
    }

    async exportChartAsJPG() {
        try {
            const canvas = this._renderChartToCanvas();
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/jpeg', 0.95);
            link.download = `${(this.displayTitle || 'gantt-chart').replace(/[^a-z0-9-_]+/gi, '_')}.jpg`;
            link.click();
        } catch (error) {
            this.errorMessage = `Export failed: ${error.message}`;
        }
    }

    toggleFullscreen() {
        if (this.isFullscreen) {
            this._exitFullscreen();
            return;
        }
        this.isFullscreen = true;
        document.body.style.overflow = 'hidden';
    }

    handleFullscreenChange() {
        // Keep fallback class mode authoritative for consistent behavior in Lightning containers.
    }

    handleScaleChange(event) {
        this.timelineScale = event.detail?.value || event.target?.value || 'months';
        this.initTimeline();
    }

    parseDate(value) {
        if (!value) return null;
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : value;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (dateOnlyMatch) {
                const year = parseInt(dateOnlyMatch[1], 10);
                const month = parseInt(dateOnlyMatch[2], 10) - 1;
                const day = parseInt(dateOnlyMatch[3], 10);
                return new Date(year, month, day);
            }
        }
        const parsed = new Date(value);
        return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }

    _parseApexDate(value) {
        if (!value) return null;
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : value;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (dateOnlyMatch) {
                const year = parseInt(dateOnlyMatch[1], 10);
                const month = parseInt(dateOnlyMatch[2], 10) - 1;
                const day = parseInt(dateOnlyMatch[3], 10);
                return new Date(year, month, day);
            }
        }
        return this.parseDate(value);
    }

    _getCurrentDate() {
        return this.orgToday ? new Date(this.orgToday.getTime()) : new Date();
    }

    _exitFullscreen() {
        this.isFullscreen = false;
        document.body.style.overflow = '';
    }

    calculateDuration(start, end) {
        if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '--';
        const weeks = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24 * 7));
        return weeks > 0 ? `${weeks}w` : '<1w';
    }

    calculateBarStyle(start, end) {
        try {
            if (!start || Number.isNaN(start?.getTime?.())) return 'display:none;';
            const timelineStart = this.startDateLimit.getTime();
            const timelineEnd = this.endDateLimit.getTime();
            const total = timelineEnd - timelineStart;
            if (total <= 0) return 'display:none;';

            const leftPct = Math.max(0, ((start.getTime() - timelineStart) / total) * 100);
            const endTime = end && !Number.isNaN(end?.getTime?.()) ? end.getTime() + DAY_MS : start.getTime() + DAY_MS;
            const durationMs = Math.max(DAY_MS, Math.max(0, endTime - start.getTime()));
            const widthPct = Math.max(1.5, (durationMs / total) * 100);
            return `left:${leftPct.toFixed(2)}%; width:${widthPct.toFixed(2)}%;`;
        } catch {
            return 'display:none;';
        }
    }

    calculateTargetMarkerStyle(targetEnd) {
        try {
            if (!targetEnd || Number.isNaN(targetEnd?.getTime?.())) return 'display:none;';
            const timelineStart = this.startDateLimit.getTime();
            const timelineEnd = this.endDateLimit.getTime();
            const total = timelineEnd - timelineStart;
            if (total <= 0) return 'display:none;';

            const offsetPct = (((targetEnd.getTime() + DAY_MS) - timelineStart) / total) * 100;
            return `left:${Math.max(0, Math.min(100, offsetPct)).toFixed(2)}%; display:block;`;
        } catch {
            return 'display:none;';
        }
    }

    _getPixelsPerDay() {
        if (!this.startDateLimit || !this.endDateLimit) {
            return 0;
        }
        const totalMs = this.endDateLimit.getTime() - this.startDateLimit.getTime();
        if (totalMs <= 0) {
            return 0;
        }
        const totalWidth = Math.max(this.timelineMonths.length * this.timelineUnitWidthPx, this.timelineUnitWidthPx);
        return totalWidth / (totalMs / DAY_MS);
    }

    _shiftDate(date, days) {
        if (!date) {
            return null;
        }
        const shifted = new Date(date);
        shifted.setDate(shifted.getDate() + days);
        return shifted;
    }

    _formatDateForApex(date) {
        if (!date || Number.isNaN(date.getTime())) {
            return null;
        }
        const year = date.getFullYear();
        const month = `${date.getMonth() + 1}`.padStart(2, '0');
        const day = `${date.getDate()}`.padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    _getObjectApiByLevel(level) {
        if (level === 1) return this.level1Object;
        if (level === 2) return this.level2Object;
        return this.level3Object;
    }

    _buildShiftedDatesForItem(record, level, days) {
        const plannedStart = this._shiftDate(this._getPlannedStartDate(record, level), days);
        const plannedEnd = this._shiftDate(this._getPlannedEndDate(record, level), days);
        const actualStart = this._shiftDate(this._getActualStartDate(record, level), days);
        const actualEnd = this._shiftDate(this._getActualEndDate(record, level), days);
        const targetEnd = this._shiftDate(this._getTargetEndDate(record, level), days);
        return { plannedStart, plannedEnd, actualStart, actualEnd, targetEnd };
    }

    _buildFieldValueMapFromDates(level, dates) {
        const values = {};
        const setIfField = (fieldName, dateValue) => {
            if (!fieldName) {
                return;
            }
            values[fieldName] = this._formatDateForApex(dateValue);
        };

        setIfField(this._getPlannedStartField(level), dates.plannedStart);
        setIfField(this._getPlannedEndField(level), dates.plannedEnd);
        setIfField(this._getActualStartField(level), dates.actualStart);
        setIfField(this._getActualEndField(level), dates.actualEnd);
        setIfField(this._getTargetEndField(level), dates.targetEnd);
        return values;
    }

    _applyDragPreview(recordId, level, days) {
        const item = this._findItem(recordId, level);
        if (!item) {
            return;
        }
        const shiftedDates = this._buildShiftedDatesForItem(item.record, level, days);
        const nextDuration = this.calculateDuration(shiftedDates.actualStart, shiftedDates.actualEnd);
        const nextBarStyle = this.calculateBarStyle(shiftedDates.actualStart, shiftedDates.actualEnd);
        const nextPlanStyle = this.calculateBarStyle(shiftedDates.plannedStart, shiftedDates.plannedEnd);
        const nextTargetStyle = this.calculateTargetMarkerStyle(shiftedDates.targetEnd);

        const updater = (entry) => {
            if (!entry || !entry.record || entry.record.Id !== recordId) {
                return entry;
            }
            return {
                ...entry,
                duration: nextDuration,
                barStyle: nextBarStyle,
                plannedBarStyle: nextPlanStyle,
                targetEndStyle: nextTargetStyle,
                hoverText: this._buildHoverText(
                    entry.record,
                    level,
                    this._getStatusValue(entry.record, this._getStatusField(level)),
                    shiftedDates.actualStart,
                    shiftedDates.actualEnd,
                    nextDuration,
                    Math.min(Math.max(entry.progress || 0, 0), 100)
                )
            };
        };

        this.level1Data = (this.level1Data || []).map((l1) => ({
            ...updater(l1),
            children: (l1.children || []).map((l2) => ({
                ...updater(l2),
                children: (l2.children || []).map((l3) => updater(l3))
            }))
        }));
    }

    _commitDragShift(drag) {
        const item = this._findItem(drag.id, drag.level);
        if (!item) {
            this._refreshBarsForCurrentScale();
            return;
        }

        const before = this._buildFieldValueMapFromDates(drag.level, drag.originalDates);
        const shiftedDates = this._buildShiftedDatesForItem(item.record, drag.level, drag.movedDays);
        const after = this._buildFieldValueMapFromDates(drag.level, shiftedDates);

        this.isSavingChange = true;
        updateRecordFields({
            objectName: drag.objectApi,
            recordId: drag.id,
            fieldValues: after
        })
            .then(() => {
                this.changeHistory = [
                    ...this.changeHistory,
                    {
                        objectApi: drag.objectApi,
                        recordId: drag.id,
                        level: drag.level,
                        before,
                        after
                    }
                ];
                this._applyRecordFieldValues(drag.id, drag.level, after);
                this._refreshView();
                this.reloadChart();
            })
            .catch((error) => {
                this.errorMessage = `Failed to update dates: ${this._msg(error)}`;
                this._refreshBarsForCurrentScale();
            })
            .finally(() => {
                this.isSavingChange = false;
            });
    }

    _applyRecordFieldValues(recordId, level, values) {
        const applyToRecord = (entry) => {
            if (!entry || !entry.record || entry.record.Id !== recordId) {
                return entry;
            }
            const nextRecord = { ...entry.record };
            Object.keys(values || {}).forEach((fieldName) => {
                nextRecord[fieldName] = values[fieldName];
            });
            return { ...entry, record: nextRecord };
        };

        if (level === 1) {
            this.sourceLevel1Data = (this.sourceLevel1Data || []).map((l1) => applyToRecord(l1));
            return;
        }

        if (level === 2) {
            this.sourceLevel1Data = (this.sourceLevel1Data || []).map((l1) => ({
                ...l1,
                children: (l1.children || []).map((l2) => applyToRecord(l2))
            }));
            return;
        }

        this.sourceLevel1Data = (this.sourceLevel1Data || []).map((l1) => ({
            ...l1,
            children: (l1.children || []).map((l2) => ({
                ...l2,
                children: (l2.children || []).map((l3) => applyToRecord(l3))
            }))
        }));
    }

    _parseFields(value) {
        if (!value) return [];
        return value
            .split(',')
            .map((fieldName) => fieldName.trim())
            .filter(Boolean);
    }

    _nameIncludes(name, term) {
        if (!term) return false;
        return (name || '').toLowerCase().includes(term);
    }

    _msg(error) {
        if (!error) return 'Unknown error';
        if (error.body?.message) return error.body.message;
        if (error.message) return error.message;
        try {
            return JSON.stringify(error);
        } catch {
            return 'See console';
        }
    }

    _validateL2Config() {
        if (!this.level2Object) {
            this.errorMessage = 'Level 2 Object is not configured.';
            return false;
        }
        if (!this.level2ParentLookup) {
            this.errorMessage = 'Level 2 Parent Lookup field is not configured.';
            return false;
        }
        if (!this.level2StartDate) {
            this.errorMessage = 'Level 2 Start Date field is not configured.';
            return false;
        }
        if (!this.level2EndDate) {
            this.errorMessage = 'Level 2 End Date field is not configured.';
            return false;
        }
        return true;
    }

    _findRecord(id) {
        for (const l1 of this.level1Data || []) {
            if (l1.record.Id === id) return l1.record;
            for (const l2 of l1.children || []) {
                if (l2.record.Id === id) return l2.record;
                for (const l3 of l2.children || []) {
                    if (l3.record.Id === id) return l3.record;
                }
            }
        }
        return null;
    }

    _getTimelineStart(fallbackDate) {
        const allDates = this._collectTimelineDates();
        const anchor = allDates.length
            ? new Date(Math.min(...allDates.map((date) => date.getTime())))
            : new Date(fallbackDate);

        if (this.timelineScale === 'years') return new Date(anchor.getFullYear(), 0, 1);
        if (this.timelineScale === 'quarters') {
            return new Date(anchor.getFullYear(), Math.floor(anchor.getMonth() / 3) * 3, 1);
        }
        if (this.timelineScale === 'months') return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        if (this.timelineScale === 'weeks') {
            const day = anchor.getDay();
            const diff = day === 0 ? -6 : 1 - day;
            const weekStart = new Date(anchor);
            weekStart.setDate(anchor.getDate() + diff);
            return new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
        }
        return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    }

    _getScaleUnitCount() {
        if (this.timelineScale === 'years') return 8;
        if (this.timelineScale === 'quarters') return 12;
        if (this.timelineScale === 'weeks') return 26;
        if (this.timelineScale === 'days') return 60;
        return 18;
    }

    _getTimelineHorizonDate() {
        const timelineDates = this._collectTimelineDates();
        const today = this._getCurrentDate();
        if (!timelineDates.length) {
            return today;
        }
        const maxTimelineDate = new Date(Math.max(...timelineDates.map((date) => date.getTime())));
        return maxTimelineDate.getTime() > today.getTime() ? maxTimelineDate : today;
    }

    _getRequiredScaleUnits(start, end) {
        if (!start || !end) {
            return 1;
        }
        const diffMs = Math.max(0, end.getTime() - start.getTime());
        const monthDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

        if (this.timelineScale === 'years') {
            return Math.max(1, end.getFullYear() - start.getFullYear() + 2);
        }
        if (this.timelineScale === 'quarters') {
            return Math.max(1, Math.ceil((monthDiff + 1) / 3) + 1);
        }
        if (this.timelineScale === 'months') {
            return Math.max(1, monthDiff + 2);
        }
        if (this.timelineScale === 'weeks') {
            return Math.max(1, Math.ceil(diffMs / (DAY_MS * 7)) + 2);
        }
        return Math.max(1, Math.ceil(diffMs / DAY_MS) + 2);
    }

    _addScaleUnits(date, offset) {
        if (this.timelineScale === 'years') return new Date(date.getFullYear() + offset, 0, 1);
        if (this.timelineScale === 'quarters') return new Date(date.getFullYear(), date.getMonth() + offset * 3, 1);
        if (this.timelineScale === 'months') return new Date(date.getFullYear(), date.getMonth() + offset, 1);
        if (this.timelineScale === 'weeks') {
            const next = new Date(date);
            next.setDate(next.getDate() + offset * 7);
            return new Date(next.getFullYear(), next.getMonth(), next.getDate());
        }
        const next = new Date(date);
        next.setDate(next.getDate() + offset);
        return new Date(next.getFullYear(), next.getMonth(), next.getDate());
    }

    _formatScaleLabel(date) {
        if (this.timelineScale === 'years') return `${date.getFullYear()}`;
        if (this.timelineScale === 'quarters') return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
        if (this.timelineScale === 'months') {
            return date.toLocaleString('default', { month: 'short', year: 'numeric' });
        }
        if (this.timelineScale === 'weeks') {
            const weekEnd = new Date(date);
            weekEnd.setDate(date.getDate() + 6);
            return `${date.toLocaleDateString('default', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('default', { month: 'short', day: 'numeric' })}`;
        }
        return date.toLocaleDateString('default', { month: 'short', day: 'numeric' });
    }

    _isCurrentUnit(unitDate, today) {
        if (this.timelineScale === 'years') return unitDate.getFullYear() === today.getFullYear();
        if (this.timelineScale === 'quarters') {
            return (
                unitDate.getFullYear() === today.getFullYear() &&
                Math.floor(unitDate.getMonth() / 3) === Math.floor(today.getMonth() / 3)
            );
        }
        if (this.timelineScale === 'months') {
            return unitDate.getFullYear() === today.getFullYear() && unitDate.getMonth() === today.getMonth();
        }
        if (this.timelineScale === 'weeks') {
            return this._getWeekStart(unitDate).getTime() === this._getWeekStart(today).getTime();
        }
        return unitDate.toDateString() === today.toDateString();
    }

    _getWeekStart(date) {
        const anchor = new Date(date);
        const day = anchor.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        anchor.setDate(anchor.getDate() + diff);
        return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    }

    _collectTimelineDates() {
        const dates = [];
        for (const l1 of this.sourceLevel1Data || []) {
            const l1Start = this._getActualStartDate(l1.record, 1) || this._getPlannedStartDate(l1.record, 1);
            const l1End = this._getActualEndDate(l1.record, 1) || this._getPlannedEndDate(l1.record, 1) || this._getTargetEndDate(l1.record, 1);
            if (l1Start) dates.push(l1Start);
            if (l1End) dates.push(l1End);
            for (const l2 of l1.children || []) {
                const l2Start = this._getActualStartDate(l2.record, 2) || this._getPlannedStartDate(l2.record, 2);
                const l2End = this._getActualEndDate(l2.record, 2) || this._getPlannedEndDate(l2.record, 2) || this._getTargetEndDate(l2.record, 2);
                if (l2Start) dates.push(l2Start);
                if (l2End) dates.push(l2End);
                for (const l3 of l2.children || []) {
                    const l3Start = this._getActualStartDate(l3.record, 3) || this._getPlannedStartDate(l3.record, 3);
                    const l3End = this._getActualEndDate(l3.record, 3) || this._getPlannedEndDate(l3.record, 3) || this._getTargetEndDate(l3.record, 3);
                    if (l3Start) dates.push(l3Start);
                    if (l3End) dates.push(l3End);
                }
            }
        }
        return dates;
    }

    _refreshView() {
        const searchTerm = this.searchTerm;
        const hasActiveQuery = this._hasActiveQuery();
        let matchCount = 0;

        const buildLevel3 = (item) => {
            const isSearchMatch = this._nameIncludes(item.record.Name, searchTerm);
            if (isSearchMatch && searchTerm) matchCount += 1;
            const visible = this._matchesStatus(item.record, this.level3Progress) && this._matchesOwner(item) && (!searchTerm || isSearchMatch);
            if (!visible) {
                return null;
            }
            return {
                ...item,
                rowClass: isSearchMatch && searchTerm ? 'l3-row search-highlight' : 'l3-row'
            };
        };

        const buildLevel2 = (item) => {
            const children = (item.children || []).map(buildLevel3).filter(Boolean);
            const isSearchMatch = this._nameIncludes(item.record.Name, searchTerm);
            if (isSearchMatch && searchTerm) matchCount += 1;
            const directVisible =
                this._matchesStatus(item.record, this.level2Progress) &&
                this._matchesOwner(item) &&
                (!searchTerm || isSearchMatch);
            if (!directVisible && children.length === 0) {
                return null;
            }
            const expandedForView = item.expanded || (hasActiveQuery && children.length > 0);
            return {
                ...item,
                expanded: expandedForView,
                children,
                rowClass:
                    isSearchMatch && searchTerm
                        ? 'l2-row search-highlight'
                        : expandedForView
                          ? 'l2-row expanded-row'
                          : 'l2-row'
            };
        };

        const view = (this.sourceLevel1Data || [])
            .map((item) => {
                const children = (item.children || []).map(buildLevel2).filter(Boolean);
                const isSearchMatch = this._nameIncludes(item.record.Name, searchTerm);
                if (isSearchMatch && searchTerm) matchCount += 1;
                const directVisible =
                    this._matchesStatus(item.record, this.level1Progress) &&
                    this._matchesOwner(item) &&
                    (!searchTerm || isSearchMatch);
                if (!directVisible && children.length === 0) {
                    return null;
                }
                const expandedForView = item.expanded || (hasActiveQuery && children.length > 0);
                return {
                    ...item,
                    expanded: expandedForView,
                    children,
                    rowClass:
                        isSearchMatch && searchTerm
                            ? 'l1-item search-highlight'
                            : expandedForView
                              ? 'l1-item expanded-row'
                              : 'l1-item'
                };
            })
            .filter(Boolean);

        this.level1Data = view;
        this.matchCount = matchCount;
        this.initTimeline();
    }

    _refreshBarsForCurrentScale() {
        this.level1Data = (this.level1Data || []).map((l1) => {
            const l1PlannedStart = this._getPlannedStartDate(l1.record, 1);
            const l1PlannedEnd = this._getPlannedEndDate(l1.record, 1);
            const l1ActualStart = this._getActualStartDate(l1.record, 1);
            const l1ActualEnd = this._getActualEndDate(l1.record, 1);
            const l1TargetEnd = this._getTargetEndDate(l1.record, 1);
            const l1Progress = Math.min(Math.max(l1.progress || 0, 0), 100);
            const l1Status = this._getStatusValue(l1.record, this.level1Progress);
            return {
                ...l1,
                plannedBarStyle: this.calculateBarStyle(l1PlannedStart, l1PlannedEnd),
                barStyle: this.calculateBarStyle(l1ActualStart, l1ActualEnd),
                targetEndStyle: this.calculateTargetMarkerStyle(l1TargetEnd),
                fillClass: this._barFillClass(l1Status, l1Progress),
                hoverText: this._buildHoverText(
                    l1.record,
                    1,
                    l1Status,
                    l1ActualStart,
                    l1ActualEnd,
                    this.calculateDuration(l1ActualStart, l1ActualEnd),
                    l1Progress
                ),
                children: (l1.children || []).map((l2) => {
                    const l2PlannedStart = this._getPlannedStartDate(l2.record, 2);
                    const l2PlannedEnd = this._getPlannedEndDate(l2.record, 2);
                    const l2ActualStart = this._getActualStartDate(l2.record, 2);
                    const l2ActualEnd = this._getActualEndDate(l2.record, 2);
                    const l2TargetEnd = this._getTargetEndDate(l2.record, 2);
                    const l2Progress = Math.min(Math.max(l2.progress || 0, 0), 100);
                    const l2Status = this._getStatusValue(l2.record, this.level2Progress);
                    return {
                        ...l2,
                        plannedBarStyle: this.calculateBarStyle(l2PlannedStart, l2PlannedEnd),
                        barStyle: this.calculateBarStyle(l2ActualStart, l2ActualEnd),
                        targetEndStyle: this.calculateTargetMarkerStyle(l2TargetEnd),
                        progressStyle: `width: ${l2Progress}%;`,
                        progressLabel: '',
                        fillClass: this._barFillClass(l2Status, l2Progress),
                        hoverText: this._buildHoverText(
                            l2.record,
                            2,
                            l2Status,
                            l2ActualStart,
                            l2ActualEnd,
                            this.calculateDuration(l2ActualStart, l2ActualEnd),
                            l2Progress
                        ),
                        children: (l2.children || []).map((l3) => {
                            const l3PlannedStart = this._getPlannedStartDate(l3.record, 3);
                            const l3PlannedEnd = this._getPlannedEndDate(l3.record, 3);
                            const l3ActualStart = this._getActualStartDate(l3.record, 3);
                            const l3ActualEnd = this._getActualEndDate(l3.record, 3);
                            const l3TargetEnd = this._getTargetEndDate(l3.record, 3);
                            const l3Progress = Math.min(Math.max(l3.progress || 0, 0), 100);
                            const l3Status = this._getStatusValue(l3.record, this.level3Progress);
                            return {
                                ...l3,
                                plannedBarStyle: this.calculateBarStyle(l3PlannedStart, l3PlannedEnd),
                                barStyle: this.calculateBarStyle(l3ActualStart, l3ActualEnd),
                                targetEndStyle: this.calculateTargetMarkerStyle(l3TargetEnd),
                                progressStyle: `width: ${l3Progress}%;`,
                                progressLabel: '',
                                fillClass: this._barFillClass(l3Status, l3Progress),
                                hoverText: this._buildHoverText(
                                    l3.record,
                                    3,
                                    l3Status,
                                    l3ActualStart,
                                    l3ActualEnd,
                                    this.calculateDuration(l3ActualStart, l3ActualEnd),
                                    l3Progress
                                )
                            };
                        })
                    };
                })
            };
        });
    }

    _getStatusValue(record, statusField) {
        if (!record || !statusField) return '';
        const value = record[statusField];
        return value == null ? '' : String(value);
    }

    _buildHoverText(record, level, statusValue, startDate, endDate, duration, progress) {
        return `${record?.Name || 'Untitled'}\nLevel: ${level}\nStatus: ${statusValue || 'N/A'}\nStart: ${this._formatDate(startDate)}\nEnd: ${this._formatDate(endDate)}\nDuration: ${duration}\nProgress: ${progress}%`;
    }

    _formatDate(value) {
        if (!value || Number.isNaN(value)) return 'N/A';
        return value.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    _getConfiguredTone(normalizedStatus) {
        if (!normalizedStatus) return '';
        return this._parseStatusColorMap().find((item) => normalizedStatus.includes(item.status))?.tone || '';
    }

    _parseStatusColorMap() {
        const raw = (this.statusColorMap || '').trim();
        if (!raw) return [];
        return raw
            .split(',')
            .map((pair) => pair.trim())
            .filter((pair) => pair.includes('='))
            .map((pair) => {
                const [status, tone] = pair.split('=').map((value) => (value || '').trim().toLowerCase());
                return { status, tone: this._normalizeTone(tone) };
            })
            .filter((item) => item.status && item.tone);
    }

    _normalizeTone(tone) {
        if (['not-started', 'progress', 'complete', 'risk'].includes(tone)) {
            return tone;
        }
        return '';
    }

    _matchesStatus(record, fieldName) {
        if (this.statusFilter === 'all') return true;
        const value = record && fieldName && record[fieldName] ? String(record[fieldName]) : '';
        return value === this.statusFilter;
    }

    _matchesOwner(item) {
        return this.ownerFilter === 'all' || item.ownerId === this.ownerFilter;
    }

    _hasExpandedRows(level1Items) {
        return (level1Items || []).some((item) => item.expanded || (item.children || []).some((child) => child.expanded));
    }

    _formatObjectLabel(apiName) {
        const raw = (apiName || 'Record').replace(/__c$/, '').replace(/_/g, ' ');
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    _findItem(id, level) {
        for (const l1 of this.level1Data || []) {
            if (level === 1 && l1.record.Id === id) {
                return l1;
            }
            for (const l2 of l1.children || []) {
                if (level === 2 && l2.record.Id === id) {
                    return l2;
                }
                for (const l3 of l2.children || []) {
                    if (level === 3 && l3.record.Id === id) {
                        return l3;
                    }
                }
            }
        }
        return null;
    }

    _getStatusField(level) {
        if (level === 1) return this.level1Progress;
        if (level === 2) return this.level2Progress;
        return this.level3Progress;
    }

    _getPlannedStartField(level) {
        if (level === 1) return this.level1PlannedStartDate || this.level1StartDate;
        if (level === 2) return this.level2PlannedStartDate || this.level2StartDate;
        return this.level3PlannedStartDate || this.level3StartDate;
    }

    _getPlannedEndField(level) {
        if (level === 1) return this.level1PlannedEndDate || this.level1EndDate;
        if (level === 2) return this.level2PlannedEndDate || this.level2EndDate;
        return this.level3PlannedEndDate || this.level3EndDate;
    }

    _getActualStartField(level) {
        if (level === 1) return this.level1ActualStartDate || this.level1StartDate;
        if (level === 2) return this.level2ActualStartDate || this.level2StartDate;
        return this.level3ActualStartDate || this.level3StartDate;
    }

    _getActualEndField(level) {
        if (level === 1) return this.level1ActualEndDate || this.level1EndDate;
        if (level === 2) return this.level2ActualEndDate || this.level2EndDate;
        return this.level3ActualEndDate || this.level3EndDate;
    }

    _getTargetEndField(level) {
        if (level === 1) return this.level1TargetEndDate || this._getPlannedEndField(1);
        if (level === 2) return this.level2TargetEndDate || this._getPlannedEndField(2);
        return this.level3TargetEndDate || this._getPlannedEndField(3);
    }

    _getPlannedStartDate(record, level) {
        const fieldName = this._getPlannedStartField(level);
        return this.parseDate(fieldName ? record[fieldName] : null);
    }

    _getPlannedEndDate(record, level) {
        const fieldName = this._getPlannedEndField(level);
        return this.parseDate(fieldName ? record[fieldName] : null);
    }

    _getActualStartDate(record, level) {
        const fieldName = this._getActualStartField(level);
        return this.parseDate(fieldName ? record[fieldName] : null);
    }

    _getActualEndDate(record, level) {
        const fieldName = this._getActualEndField(level);
        return this.parseDate(fieldName ? record[fieldName] : null);
    }

    _getTargetEndDate(record, level) {
        const fieldName = this._getTargetEndField(level);
        return this.parseDate(fieldName ? record[fieldName] : null);
    }

    _getItemStartDate(item, level) {
        const fieldName = this._getActualStartField(level);
        return this.parseDate(fieldName ? item.record[fieldName] : null);
    }

    _getItemEndDate(item, level) {
        const fieldName = this._getActualEndField(level);
        return this.parseDate(fieldName ? item.record[fieldName] : null);
    }

    _getLatestEndDate() {
        const endDates = this._collectTimelineEndDates();
        if (!endDates.length) {
            return null;
        }
        return new Date(Math.max(...endDates.map((date) => date.getTime())));
    }

    _collectTimelineEndDates() {
        const dates = [];
        for (const l1 of this.sourceLevel1Data || []) {
            const l1End = this.parseDate(this.level1EndDate ? l1.record[this.level1EndDate] : null);
            if (l1End) dates.push(l1End);
            for (const l2 of l1.children || []) {
                const l2End = this.parseDate(this.level2EndDate ? l2.record[this.level2EndDate] : null);
                if (l2End) dates.push(l2End);
                for (const l3 of l2.children || []) {
                    const l3End = this.parseDate(this.level3EndDate ? l3.record[this.level3EndDate] : null);
                    if (l3End) dates.push(l3End);
                }
            }
        }
        return dates;
    }

    _buildTooltipStyle(event) {
        if (!event) {
            return '';
        }
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const eventX = typeof event.clientX === 'number' && event.clientX > 0
            ? event.clientX
            : (event.currentTarget ? event.currentTarget.getBoundingClientRect().left + 12 : 12);
        const eventY = typeof event.clientY === 'number' && event.clientY > 0
            ? event.clientY
            : (event.currentTarget ? event.currentTarget.getBoundingClientRect().top + 12 : 12);
        const chartRect = this.template.querySelector('.gantt-content')?.getBoundingClientRect();
        const minTop = chartRect ? chartRect.top + 8 : 12;

        let left = eventX + 14;
        let top = Math.max(minTop, eventY + 14);

        if (left + TOOLTIP_WIDTH_PX > viewportWidth - 12) {
            left = Math.max(12, eventX - TOOLTIP_WIDTH_PX - 14);
        }
        if (top + TOOLTIP_HEIGHT_PX > viewportHeight - 12) {
            top = Math.max(minTop, eventY - TOOLTIP_HEIGHT_PX - 14);
        }

        return `left:${left}px; top:${top}px;`;
    }

    _renderChartToCanvas() {
        const rows = [];
        for (const l1 of this.level1Data || []) {
            rows.push({ type: 'l1', item: l1 });
            if (l1.expanded) {
                for (const l2 of l1.children || []) {
                    rows.push({ type: 'l2', item: l2 });
                    if (l2.expanded) {
                        for (const l3 of l2.children || []) {
                            rows.push({ type: 'l3', item: l3 });
                        }
                    }
                }
            }
        }

        const sidebarWidth = 520;
        const chartWidth = Math.max(this.timelineMonths.length * TIMELINE_CELL_WIDTH_PX, 900);
        const headerHeight = 44;
        const filterHeight = 44;
        const rowHeightL1 = 38;
        const rowHeightChild = 34;
        const contentHeight = rows.reduce((sum, row) => sum + (row.type === 'l1' ? rowHeightL1 : rowHeightChild), 0) || 220;
        const width = sidebarWidth + chartWidth;
        const height = headerHeight + filterHeight + headerHeight + contentHeight;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#f7f7f7';
        ctx.fillRect(0, headerHeight + filterHeight, width, headerHeight);
        ctx.strokeStyle = '#0176d3';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, headerHeight + filterHeight + headerHeight);
        ctx.lineTo(width, headerHeight + filterHeight + headerHeight);
        ctx.stroke();

        ctx.font = '700 11px Segoe UI';
        ctx.fillStyle = '#475569';
        ctx.fillText('NAME', 18, headerHeight + filterHeight + 26);
            ctx.fillText('DURATION', 330, headerHeight + filterHeight + 26);
        ctx.fillText('OWNER', 438, headerHeight + filterHeight + 26);

        this.timelineMonths.forEach((month, index) => {
            const x = sidebarWidth + index * TIMELINE_CELL_WIDTH_PX;
            ctx.strokeStyle = '#e8edf3';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, headerHeight + filterHeight);
            ctx.lineTo(x, height);
            ctx.stroke();
            ctx.fillStyle = month.cellClass.includes('is-current') ? '#0176d3' : '#64748b';
            ctx.font = '700 11px Segoe UI';
            ctx.fillText(month.label, x + 8, headerHeight + filterHeight + 26);
        });

        const currentDate = this._getCurrentDate();
        const todayRatio =
            this.startDateLimit && this.endDateLimit
                ? (currentDate.getTime() - this.startDateLimit.getTime()) / (this.endDateLimit.getTime() - this.startDateLimit.getTime())
                : 0;
        const todayX = sidebarWidth + Math.max(0, todayRatio) * chartWidth;
        ctx.strokeStyle = '#e53935';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(todayX, headerHeight + filterHeight + headerHeight);
        ctx.lineTo(todayX, height);
        ctx.stroke();

        const targetLineStyle = this.projectEndLineStyle;
        if (!targetLineStyle.includes('display:none')) {
            const match = targetLineStyle.match(/left:([0-9.]+)%/);
            if (match) {
                const targetX = sidebarWidth + (parseFloat(match[1]) / 100) * chartWidth;
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = '#2e7d32';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(targetX, headerHeight + filterHeight + headerHeight);
                ctx.lineTo(targetX, height);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        let currentY = headerHeight + filterHeight + headerHeight;
        rows.forEach((row) => {
            const rowHeight = row.type === 'l1' ? rowHeightL1 : rowHeightChild;
            ctx.fillStyle = row.type === 'l1' ? '#fafbfc' : '#ffffff';
            ctx.fillRect(0, currentY, width, rowHeight);
            ctx.strokeStyle = '#edf2f7';
            ctx.beginPath();
            ctx.moveTo(0, currentY + rowHeight);
            ctx.lineTo(width, currentY + rowHeight);
            ctx.stroke();

            ctx.fillStyle = '#334155';
            ctx.font = row.type === 'l1' ? '700 12px Segoe UI' : '500 12px Segoe UI';
            const textX = row.type === 'l1' ? 28 : row.type === 'l2' ? 46 : 64;
            ctx.fillText(row.item.record?.Name || '', textX, currentY + 22);
            ctx.fillStyle = '#64748b';
            ctx.font = '700 11px Segoe UI';
            ctx.fillText(row.item.duration || '', 330, currentY + 22);
            ctx.fillText(row.item.ownerName || '', 438, currentY + 22);

            const leftMatch = String(row.item.barStyle || '').match(/left:([0-9.]+)%/);
            const widthMatch = String(row.item.barStyle || '').match(/width:([0-9.]+)%/);
            if (leftMatch && widthMatch) {
                const barX = sidebarWidth + (parseFloat(leftMatch[1]) / 100) * chartWidth;
                const barWidth = Math.max(18, (parseFloat(widthMatch[1]) / 100) * chartWidth);
                const barY = currentY + (rowHeight - (row.type === 'l1' ? 22 : 18)) / 2;
                const borderHeight = row.type === 'l1' ? 22 : 24;

                if (row.type !== 'l1') {
                    ctx.setLineDash([4, 3]);
                    ctx.strokeStyle = '#1976d2';
                    ctx.strokeRect(barX, currentY + (rowHeight - borderHeight) / 2, barWidth, borderHeight);
                    ctx.setLineDash([]);
                }

                ctx.fillStyle = row.type === 'l1' ? '#0b5f1b' : row.item.fillClass.includes('complete') ? '#43a047' : row.item.fillClass.includes('risk') ? '#d84315' : row.item.fillClass.includes('not-started') ? '#7c8da2' : '#1e88e5';
                const innerWidth = row.type === 'l1' ? barWidth : Math.max(10, barWidth * (parseFloat((row.item.progressStyle || 'width:100').match(/([0-9.]+)/)?.[1] || '100') / 100));
                const innerHeight = row.type === 'l1' ? 22 : 18;
                ctx.fillRect(barX, barY, innerWidth, innerHeight);
            }

            currentY += rowHeight;
        });

        return canvas;
    }

}
