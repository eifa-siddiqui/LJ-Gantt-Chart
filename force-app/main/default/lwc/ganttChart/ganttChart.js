import { LightningElement, api, track } from "lwc";
import getGanttData from "@salesforce/apex/DynamicGanttController.getGanttData";
import getAvailableUsers from "@salesforce/apex/DynamicGanttController.getAvailableUsers";
import getStatusOptions from "@salesforce/apex/DynamicGanttController.getStatusOptions";
import getOrgToday from "@salesforce/apex/DynamicGanttController.getOrgToday";
import updateRecordFields from "@salesforce/apex/DynamicGanttController.updateRecordFields";
import getObjectFields from "@salesforce/apex/DynamicGanttController.getObjectFields";

const STATUS_COLOR_PALETTE = {
  red:    '#dc2626',
  orange: '#f97316',
  yellow: '#ca8a04',
  green:  '#15803d',
  blue:   '#2d5a8e',
  navy:   '#1e3a5f',
  purple: '#7c3aed',
  pink:   '#db2777',
  teal:   '#0f766e',
  grey:   '#64748b',
  white:  '#f8fafc',
  black:  '#0f172a'
};
const TIMELINE_CELL_WIDTH_PX = 130;
const DAY_MS = 1000 * 60 * 60 * 24;
const TOOLTIP_WIDTH_PX = 220;
const TOOLTIP_HEIGHT_PX = 150;
const SIDEBAR_FRAME_PX = 34;
const COLUMN_GAP_PX = 10;
const DEFAULT_SIDEBAR_WIDTH = 428;
const DEFAULT_DURATION_COL_WIDTH = 78;
const DEFAULT_OWNER_COL_WIDTH = 76;
const MIN_NAME_COL_WIDTH = 160;
const MIN_DURATION_COL_WIDTH = 64;
const MAX_DURATION_COL_WIDTH = 120;
const MIN_SIDEBAR_WIDTH =
  SIDEBAR_FRAME_PX +
  MIN_NAME_COL_WIDTH +
  DEFAULT_DURATION_COL_WIDTH +
  DEFAULT_OWNER_COL_WIDTH +
  COLUMN_GAP_PX * 2;
const MAX_SIDEBAR_WIDTH = 620;

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
  @api level1Section1Name;
  @api level1Section1Fields;
  @api level1Section2Name;
  @api level1Section2Fields;

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
  @api level2Section1Name;
  @api level2Section1Fields;
  @api level2Section2Name;
  @api level2Section2Fields;

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
  @api level3Section1Name;
  @api level3Section1Fields;
  @api level3Section2Name;
  @api level3Section2Fields;

  @track level1Data = [];
  @track timelineMonths = [];
  @track matchCount = 0;
  @track selectedRecordId;
  @track selectedObjectApi;
  @track selectedLevel;
  @track section1 = { name: "", fields: [] };
  @track section2 = { name: "", fields: [] };
  @track isLoading = false;
  @track errorMessage = "";
  @track ownerChoices = [];
  @track statusChoices = [];
  @track tooltip = { visible: false, title: "", details: [], style: "" };
  @track selectedItemCache = null;
  @track exportMenuOpen = false;
  @track isFilterPanelOpen   = false;
  @track filterRows          = [];
  @track availableFilterFields = [];
  @track activeFilterCount   = 0;
  
  _filterRowCounter          = 0;

  startDateLimit;
  endDateLimit;
  orgToday;
  @track searchTerm = "";
  @track sourceLevel1Data = [];
  @track changeHistory = [];
  @track isSavingChange = false;
  @track dragConfirm = { visible: false };
  @track dragTooltip = { visible: false, label: "", dateStr: "", style: "" };
  @track isDarkMode = false;
  todayLineStyle = "";
  timelineScale = "months";
  isFullscreen = false;
  statusFilter = "all";
  ownerFilter = "all";
  isCurrentRecordScope = false;
  suppressBarClick = false;
  dragState = null;
  sidebarResizeState = null;
  isEditMode = false;
  inlineEditBaseline = null;
  inlineEditPendingValues = null;
  durationColWidth = DEFAULT_DURATION_COL_WIDTH;
  ownerColWidth = DEFAULT_OWNER_COL_WIDTH;
  sidebarWidthValue = DEFAULT_SIDEBAR_WIDTH;
  toggleDarkMode() {
  this.isDarkMode = !this.isDarkMode;
}
toggleExportMenu(event) {
  event.stopPropagation();
  this.exportMenuOpen = !this.exportMenuOpen;
}

closeExportMenu() {
  this.exportMenuOpen = false;
}
  get allObjectsButtonLabel() {
    return this.allObjectsLabel || "All Projects";
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
    const raw = (this.hierarchyLevel || "").toString().trim().toLowerCase();
    if (raw === "no hierarchy") return 0;
    if (raw === "1 level") return 1;
    if (raw === "2 levels") return 2;
    if (raw === "3 levels") return 3;
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? 2 : Math.min(Math.max(parsed, 0), 3);
  }

  get showBullets() {
    return this.hierarchyDepth === 0;
  }

  get supportsLevel2() {
    return (
      this.hierarchyDepth >= 1 &&
      !!this.level2Object &&
      !!this.level2ParentLookup
    );
  }

  get supportsLevel3() {
    return (
      this.hierarchyDepth >= 2 &&
      !!this.level3Object &&
      !!this.level3ParentLookup
    );
  }
get selectedRecordOverdueRisk() {
  return this.selectedItemCache?.overdueRisk || null;
}

get isSelectedRecordOverdue() {
  return !!this.selectedItemCache?.overdueRisk;
}
  get disableHierarchyActions() {
    return !this.supportsLevel2 || !this.hasData;
  }

  get wrapperClass() {
  const fullscreenClass = this.isFullscreen ? ' is-fullscreen' : '';
  const darkClass       = this.isDarkMode   ? ' dark-mode'     : '';
  return `gantt-wrapper scale-${this.timelineScale}${fullscreenClass}${darkClass}`;
}
get darkModeIcon() {
  return this.isDarkMode ? 'utility:light' : 'utility:dark_mode';
}

get darkModeTitle() {
  return this.isDarkMode ? 'Light Mode' : 'Dark Mode';
}

  get wrapperStyle() {
    return `--name-col-width:${this.nameColWidth}px; --duration-col-width:${this.durationColWidth}px; --owner-col-width:${this.ownerColWidth}px; --sidebar-width:${this.sidebarWidthPx}px;`;
  }

  get displayTitle() {
    return (this.chartTitle || "").trim() || this.level1Object || "Gantt Chart";
  }

  get hasData() {
    return Array.isArray(this.level1Data) && this.level1Data.length > 0;
  }

  get hasSearchTerm() {
    return !!this.searchTerm;
  }

  get searchResultInfo() {
    return `${this.matchCount} match${this.matchCount === 1 ? "" : "es"}`;
  }

  get hasSection1() {
    return (
      this.section1 &&
      Array.isArray(this.section1.fields) &&
      this.section1.fields.length > 0
    );
  }

  get hasSection2() {
    return (
      this.section2 &&
      Array.isArray(this.section2.fields) &&
      this.section2.fields.length > 0
    );
  }

  get selectedRecordSummary() {
  return this.selectedItemCache?.summary || [];
}

  get tooltipVisible() {
    return this.tooltip.visible;
  }

  get tooltipDragVisible() {
    return this.dragTooltip?.visible === true;
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
    return "display:none;";
  }

  get hierarchyButtonLabel() {
    return this._hasExpandedRows(this.sourceLevel1Data)
      ? "Collapse All"
      : "Expand All";
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

  get actualStartField() {
    return this._getActualStartField(this.selectedLevel || 1);
  }

  get actualEndField() {
    return this._getActualEndField(this.selectedLevel || 1);
  }

  get statusFieldName() {
    return this._getStatusField(this.selectedLevel || 1);
  }

  get editFieldList() {
    const level = this.selectedLevel || 1;
    const configuredFields = [
      ...(this.hasSection1 ? this.section1.fields : []),
      ...(this.hasSection2 ? this.section2.fields : [])
    ];
    const combined = [
      "Name",
      "OwnerId",
      this._getActualStartField(level),
      this._getActualEndField(level),
      this._getStatusField(level),
      ...configuredFields
    ].filter(Boolean);
    return [...new Set(combined)];
  }

  get modalTitle() {
    if (!this.selectedRecordId) return "";
    const record = this._findRecord(this.selectedRecordId);
    return record ? record.Name : "Record Details";
  }

  get modalLevelLabel() {
    return this.selectedLevel ? `Level ${this.selectedLevel}` : "";
  }

  get scaleOptions() {
    return [
      { label: "Years", value: "years" },
      { label: "Quarters", value: "quarters" },
      { label: "Months", value: "months" },
      { label: "Weeks", value: "weeks" },
      { label: "Days", value: "days" }
    ];
  }

  get scaleSelectOptions() {
    return this.scaleOptions.map((option) => ({
      ...option,
      selected: option.value === this.timelineScale
    }));
  }

  get fullscreenLabel() {
    return this.isFullscreen ? "Exit Full Screen" : "Full Screen";
  }
  get fullscreenIcon() {
    return this.isFullscreen ? "utility:contract_alt" : "utility:fullscreen";
  }

  get statusOptions() {
    return [{ label: "All Statuses", value: "all" }, ...this.statusChoices];
  }

  get statusSelectOptions() {
    return this.statusOptions.map((option) => ({
      ...option,
      selected: option.value === this.statusFilter
    }));
  }

  get ownerOptions() {
    return [{ label: "All Owners", value: "all" }, ...this.ownerChoices];
  }

  get ownerSelectOptions() {
    return this.ownerOptions.map((option) => ({
      ...option,
      selected: option.value === this.ownerFilter
    }));
  }

  get timelineUnitWidthPx() {
    if (this.timelineScale === "years") return 190;
    if (this.timelineScale === "quarters") return 150;
    if (this.timelineScale === "weeks") return 112;
    if (this.timelineScale === "days") return 84;
    return TIMELINE_CELL_WIDTH_PX;
  }

  get sidebarWidthPx() {
    return this.sidebarWidthValue;
  }

  get nameColWidth() {
    return Math.max(
      MIN_NAME_COL_WIDTH,
      this.sidebarWidthPx -
        SIDEBAR_FRAME_PX -
        this.durationColWidth -
        this.ownerColWidth -
        COLUMN_GAP_PX * 2
    );
  }

  get timelineBodyStyle() {
    const width = Math.max(
      this.timelineMonths.length * this.timelineUnitWidthPx,
      this.timelineUnitWidthPx
    );
    return `width:${width}px; min-width:${width}px;`;
  }

  get todayLabel() {
    const today = this._getCurrentDate();
    return `TODAY ${today.toLocaleDateString("en-GB")}`;
  }

  scrollToToday() {
    const timeline = this.template.querySelector(".timeline-body-viewport");
    const header = this.template.querySelector(".timeline-header-scroll");
    if (!timeline || !this.startDateLimit || !this.endDateLimit) {
      return;
    }
    const total = this.endDateLimit.getTime() - this.startDateLimit.getTime();
    if (total <= 0) {
      return;
    }
    const currentDate = this._getCurrentDate();
    const ratio = Math.max(
      0,
      Math.min(
        1,
        (currentDate.getTime() - this.startDateLimit.getTime()) / total
      )
    );
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
    this._sidebarResizeMoveHandler = this.handleSidebarResizeMove.bind(this);
    this._sidebarResizeEndHandler = this.handleSidebarResizeEnd.bind(this);
    this._exportClickOutHandler = () => {
  if (this.exportMenuOpen) {
    this.exportMenuOpen = false;
  }
};
// Use capture:true to intercept clicks through shadow DOM boundaries
document.addEventListener('click', this._exportClickOutHandler, true);
    document.addEventListener("fullscreenchange", this._fullscreenHandler);
    document.addEventListener("keydown", this._keydownHandler);
    document.addEventListener("mousemove", this._dragMoveHandler);
    document.addEventListener("mouseup", this._dragEndHandler);
    document.addEventListener("mousemove", this._sidebarResizeMoveHandler);
    document.addEventListener("mouseup", this._sidebarResizeEndHandler);
    window.addEventListener("resize", this._resizeHandler);

    this.isCurrentRecordScope = !!this.recordId;
    this.initTimeline();
    this.loadOrgToday();
    this.loadOwners();
    this.loadStatusOptions();
    this.loadLevel1();
  }

  disconnectedCallback() {
    if (this._fullscreenHandler) {
      document.removeEventListener("fullscreenchange", this._fullscreenHandler);
    }
    if (this._keydownHandler) {
      document.removeEventListener("keydown", this._keydownHandler);
    }
    if (this._dragMoveHandler) {
      document.removeEventListener("mousemove", this._dragMoveHandler);
    }
    if (this._dragEndHandler) {
      document.removeEventListener("mouseup", this._dragEndHandler);
    }
    if (this._sidebarResizeMoveHandler) {
      document.removeEventListener("mousemove", this._sidebarResizeMoveHandler);
    }
    if (this._sidebarResizeEndHandler) {
      document.removeEventListener("mouseup", this._sidebarResizeEndHandler);
    }
    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
    }
    if (this._exportClickOutHandler) {
document.removeEventListener('click', this._exportClickOutHandler, true);}
  }

  handleDocumentKeyDown(event) {
    if ((event.key || event.code) === "Escape" && this.isFullscreen) {
      event.preventDefault();
      this._exitFullscreen();
    }
  }

  handleWindowResize() {
    this.initTimeline();
  }

  handleSidebarResizeStart(event) {
    event.preventDefault();
    event.stopPropagation();
    this.sidebarResizeState = {
      startX: event.clientX,
      sidebarWidth: this.sidebarWidthPx
    };
  }

  handleSidebarResizeMove(event) {
    if (!this.sidebarResizeState) {
      return;
    }
    const delta = event.clientX - this.sidebarResizeState.startX;
    this.sidebarWidthValue = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, this.sidebarResizeState.sidebarWidth + delta)
    );
  }

  handleSidebarResizeEnd() {
    if (!this.sidebarResizeState) {
      return;
    }
    this.sidebarResizeState = null;
  }

  _getOwnerInitials(ownerName) {
    if (!ownerName) return "?";
    const names = ownerName.trim().split(/\s+/);
    if (names.length === 1) {
      return names[0].substring(0, 2).toUpperCase();
    }
    const first = names[0].charAt(0).toUpperCase();
    const last = names[names.length - 1].charAt(0).toUpperCase();
    return (first + last).substring(0, 2);
  }

  _getOwnerColor(ownerId) {
    if (!ownerId) return "#94a3b8";
    const colors = [
      "#3b82f6",
      "#ef4444",
      "#10b981",
      "#f59e0b",
      "#8b5cf6",
      "#ec4899",
      "#14b8a6",
      "#f97316",
      "#6366f1",
      "#06b6d4"
    ];
    let hash = 0;
    for (let i = 0; i < ownerId.length; i++) {
      const char = ownerId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return colors[Math.abs(hash) % colors.length];
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
            const value = (user.value || "").toLowerCase();
            const label = (user.label || "").toLowerCase();
            return (
              value !== "all" &&
              !label.includes("all assignee") &&
              !label.includes("all owner")
            );
          });
      })
      .catch(() => {
        this.ownerChoices = [];
      });
  }

  loadStatusOptions() {
    getStatusOptions({
      objectName: this.supportsLevel2
        ? this.level2Object || this.level1Object
        : this.level1Object,
      statusField: this.supportsLevel2
        ? this.level2Progress || this.level1Progress
        : this.level1Progress
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

  initTimeline(preserveScroll = false) {
    const today = this._getCurrentDate();
    const start = this._getTimelineStart(today);
    const horizon = this._getTimelineHorizonDate();
    const totalUnits = Math.max(
      this._getScaleUnitCount(),
      this._getRequiredScaleUnits(start, horizon)
    );
    this.startDateLimit = new Date(start);

    const timelineEndDate = this._addScaleUnits(start, totalUnits);
    const denominator = timelineEndDate.getTime() - start.getTime();
    const todayOffsetPct =
      ((today.getTime() - start.getTime()) / denominator) * 100;
    this.todayLineStyle = `left:${Math.max(0, Math.min(100, todayOffsetPct)).toFixed(2)}%; display:block;`;

    this.timelineMonths = Array.from({ length: totalUnits }, (_, index) => {
      const date = this._addScaleUnits(start, index);
      return {
        label: this._formatScaleLabel(date),
        timestamp: date.getTime(),
        cellClass: this._isCurrentUnit(date, today)
          ? "timeline-month-cell is-current"
          : "timeline-month-cell"
      };
    });

    this.endDateLimit = timelineEndDate;
    this._refreshBarsForCurrentScale();
if (!preserveScroll) {
  setTimeout(() => this.scrollToToday(), 0);
}
  }

  loadLevel1() {
  if (!this.level1Object) {
    this.errorMessage = "Level 1 Object is not configured.";
    return;
  }

  this.isLoading = true;
  this.errorMessage = "";

  // Merge configured fields + any active filter fields
  const filterFields = this._getActiveFilterFieldNames();
  const fields = [
    this.level1DisplayField,
    this.level1StartDate,
    this.level1EndDate,
    this.level1PlannedStartDate,
    this.level1PlannedEndDate,
    this.level1ActualStartDate,
    this.level1ActualEndDate,
    this.level1TargetEndDate,
    this.level1Progress,
    ...filterFields              // ← ADD THIS
  ].filter(Boolean);

  // Deduplicate
  const uniqueFields = [...new Set(fields)].join(",");

  getGanttData({
    objectName: this.level1Object,
    fields: uniqueFields,        // ← use uniqueFields
    lookupField: "",
    parentId: "",
    statusField: this.level1Progress || "",
    startDateField: this.level1StartDate || "",
    searchTerm: "",
    specificRecordId: this.isCurrentRecordScope ? this.recordId : ""
  })
  // ... rest unchanged
  .then((result) => {
    this.sourceLevel1Data = (result || [])
      .map((item) => this._wrapL1(item))
      .sort((a, b) => {
        const aStart =
          this._getActualStartDate(a.record, 1) ||
          this._getPlannedStartDate(a.record, 1);
        const bStart =
          this._getActualStartDate(b.record, 1) ||
          this._getPlannedStartDate(b.record, 1);

        // Records with no date go to the bottom
        if (!aStart && !bStart) return 0;
        if (!aStart) return 1;
        if (!bStart) return -1;

        return aStart.getTime() - bStart.getTime();
      });

    this._refreshView();

    this.isLoading = false;
    setTimeout(() => this.scrollToToday(), 0);
  })
  .catch((error) => {
    this.errorMessage = `Error loading Level 1: ${this._msg(error)}`;
    this.isLoading = false;
  });
}
  _loadLevel2(parentId) {
  const filterFields = this._getActiveFilterFieldNames();
  const fields = [
    this.level2SidebarFields,
    this.level2Section1Fields,
    this.level2Section2Fields,
    this.level2StartDate,
    this.level2EndDate,
    this.level2PlannedStartDate,
    this.level2PlannedEndDate,
    this.level2ActualStartDate,
    this.level2ActualEndDate,
    this.level2TargetEndDate,
    this.level2Progress,
    ...filterFields              // ← ADD THIS
  ].filter(Boolean).join(",");
  // ... rest unchanged

    return getGanttData({
      objectName: this.level2Object,
      fields,
      lookupField: this.level2ParentLookup,
      parentId,
      statusField: this.level2Progress || "",
      startDateField: this.level2StartDate || "",
      searchTerm: "",
      specificRecordId: ""
    }).then((result) =>
      (result || []).map((child) => this._wrapChild(child, 2))
    );
  }

  _loadLevel3(parentId) {
    const filterFields = this._getActiveFilterFieldNames();
    const fields = [
      this.level3Section1Fields,
      this.level3Section2Fields,
      this.level3StartDate,
      this.level3EndDate,
      this.level3PlannedStartDate,
      this.level3PlannedEndDate,
      this.level3ActualStartDate,
      this.level3ActualEndDate,
      this.level3TargetEndDate,
      this.level3Progress,
      ...filterFields
    ]
      .filter(Boolean)
      .join(",");

    return getGanttData({
      objectName: this.level3Object,
      fields,
      lookupField: this.level3ParentLookup,
      parentId,
      statusField: this.level3Progress || "",
      startDateField: this.level3StartDate || "",
      searchTerm: "",
      specificRecordId: ""
    }).then((result) =>
      (result || []).map((child) => this._wrapChild(child, 3))
    );
  }

  _wrapL1(item) {
    const plannedStartDate = this._getPlannedStartDate(item.record, 1);
    const plannedEndDate = this._getPlannedEndDate(item.record, 1);
    const actualStartDate = this._getActualStartDate(item.record, 1);
    const actualEndDate = this._getActualEndDate(item.record, 1);
    const targetEndDate = this._getTargetEndDate(item.record, 1);
    const barEndDate = this._getBarEndDate(item.record, 1);
    const statusValue = this._getStatusValue(item.record, this.level1Progress);
    const progress = Math.min(Math.max(item.progress || 0, 0), 100);
    const fillClass = this._barFillClass(statusValue, progress);

    const isComplete = fillClass.includes("complete");
    let completedEarlyStyle = null;
    if (
      isComplete &&
      actualEndDate &&
      targetEndDate &&
      actualEndDate.getTime() < targetEndDate.getTime()
    ) {
      completedEarlyStyle = this.calculateBarStyle(
        actualEndDate,
        targetEndDate
      );
    }

    const outlineStyle = this._calculateOutlineBarStyle(
      plannedStartDate,
      targetEndDate || plannedEndDate
    );

    return {
      ...item,
      _l2Loaded: false,
      expanded: false,
      iconClass: "expand-icon",
      rowClass: "l1-item",
      children: [],
      hasChildren: item.children && item.children.length > 0,
      duration: this.calculateDuration(actualStartDate, barEndDate),
      plannedBarStyle: outlineStyle,
      barStyle: this.calculateBarStyle(
        actualStartDate || plannedStartDate,
        barEndDate
      ),
      completedEarlyStyle,
      targetEndStyle: this._calculateTargetMarkerStyleFromBarStyle(
        outlineStyle,
        targetEndDate || plannedEndDate
      ),
      barClass: `gantt-bar-item actual-bar-item ${this._barToneClass(fillClass)}`,
      progressStyle: this._buildProgressStyle(progress, statusValue) +
               this._getBarColorOverride(statusValue),
      progressLabel: this._getStatusLabel(statusValue),
      statusLabelClass: this._getStatusLabelClass(
        statusValue,
        actualStartDate,
        barEndDate
      ),
      fillClass,
      hoverText: this._buildHoverText(
        item.record,
        1,
        statusValue,
        actualStartDate,
        barEndDate,
        this.calculateDuration(actualStartDate, barEndDate),
        progress
      ),
      overdueRisk: this._buildOverdueRisk(item.record, 1),
barClass: `gantt-bar-item actual-bar-item ${this._barToneClass(fillClass)}${this._buildOverdueRisk(item.record, 1) ? ' overdue-risk' : ''}`,
      ownerName: item.record?.Owner?.Name || "",
      ownerInitials: this._getOwnerInitials(item.record?.Owner?.Name || ""),
      ownerColor: this._getOwnerColor(item.record?.OwnerId || ""),
      ownerAvatarStyle: `background-color: ${this._getOwnerColor(item.record?.OwnerId || "")}; color: #ffffff;`,
      ownerId: item.record?.OwnerId || "",
      expanded: false,
      iconClass: "expand-icon"
    };
  }

  _wrapChild(child, level) {
    const statusField = level === 2 ? this.level2Progress : this.level3Progress;
    const plannedStartDate = this._getPlannedStartDate(child.record, level);
    const plannedEndDate = this._getPlannedEndDate(child.record, level);
    const actualStartDate = this._getActualStartDate(child.record, level);
    const actualEndDate = this._getActualEndDate(child.record, level);
    const targetEndDate = this._getTargetEndDate(child.record, level);
    const barEndDate = this._getBarEndDate(child.record, level);
    const progress = Math.min(Math.max(child.progress || 0, 0), 100);
    const statusValue = this._getStatusValue(child.record, statusField);
    const duration = this.calculateDuration(actualStartDate, barEndDate);
    const fillClass = this._barFillClass(statusValue, progress);

    const isComplete = fillClass.includes("complete");
    let completedEarlyStyle = null;
    if (
      isComplete &&
      actualEndDate &&
      targetEndDate &&
      actualEndDate.getTime() < targetEndDate.getTime()
    ) {
      completedEarlyStyle = this.calculateBarStyle(
        actualEndDate,
        targetEndDate
      );
    }

    const outlineStyle = this._calculateOutlineBarStyle(
      plannedStartDate,
      targetEndDate || plannedEndDate
    );

    return {
      ...child,
      expanded: false,
      rowClass: level === 2 ? "l2-row" : "l3-row",
      iconClass: "expand-icon",
      duration,
      plannedBarStyle: outlineStyle,
      barStyle: this.calculateBarStyle(
        actualStartDate || plannedStartDate,
        barEndDate
      ),
      completedEarlyStyle,
      targetEndStyle: this._calculateTargetMarkerStyleFromBarStyle(
        outlineStyle,
        targetEndDate || plannedEndDate
      ),
      overdueRisk: this._buildOverdueRisk(child.record, level),
barClass: `${level === 2 ? "gantt-bar-item actual-bar-item" : "gantt-bar-item l3-bar actual-bar-item"} ${this._barToneClass(fillClass)}${this._buildOverdueRisk(child.record, level) ? ' overdue-risk' : ''}`,
      progressStyle: this._buildProgressStyle(progress, statusValue) +
               this._getBarColorOverride(statusValue),
      progressLabel: statusValue || "",
      statusLabelClass: this._getStatusLabelClass(
        statusValue,
        actualStartDate,
        barEndDate
      ),
      fillClass,
      hoverText: this._buildHoverText(
        child.record,
        level,
        statusValue,
        actualStartDate,
        barEndDate,
        duration,
        progress
      ),
      children: [],
      ownerName: child.record?.Owner?.Name || "",
      ownerInitials: this._getOwnerInitials(child.record?.Owner?.Name || ""),
      ownerColor: this._getOwnerColor(child.record?.OwnerId || ""),
      ownerAvatarStyle: `background-color: ${this._getOwnerColor(child.record?.OwnerId || "")}; color: #ffffff;`,
      ownerId: child.record?.OwnerId || ""
    };
  }

  _determineStatusTone(statusValue) {
    const normalizedStatus = (statusValue || "").toLowerCase();
    const customTone = this._getConfiguredTone(normalizedStatus);
    if (customTone) return customTone;

    if (!normalizedStatus) return "na";

    if (
      normalizedStatus.includes("complete") ||
      normalizedStatus.includes("completed") ||
      normalizedStatus.includes("done") ||
      normalizedStatus.includes("closed") ||
      normalizedStatus.includes("finished") ||
      normalizedStatus.includes("resolved") ||
      normalizedStatus.includes("approved")
    ) return "complete";

    if (normalizedStatus.includes("pending")) return "pending";

    if (normalizedStatus.includes("new")) return "not-started";

    if (
      normalizedStatus.includes("hold") ||
      normalizedStatus.includes("risk") ||
      normalizedStatus.includes("blocked") ||
      normalizedStatus.includes("delay") ||
      normalizedStatus.includes("on hold") ||
      normalizedStatus.includes("stopped") ||
      normalizedStatus.includes("cancelled") ||
      normalizedStatus.includes("canceled") ||
      normalizedStatus.includes("waiting")
    ) return "pending";

    if (
      normalizedStatus.includes("not") ||
      normalizedStatus.includes("plan") ||
      normalizedStatus.includes("open") ||
      normalizedStatus.includes("todo") ||
      normalizedStatus.includes("draft") ||
      normalizedStatus.includes("queued")
    ) return "not-started";

    // Used for mapping if no substring matches
    return "na";
  }

  _barFillClass(statusValue, progress) {
    const normalizedStatus = (statusValue || "").toLowerCase();
    const tone = this._determineStatusTone(statusValue);

    if (this._getConfiguredTone(normalizedStatus)) {
      return `gantt-bar-fill status-${tone}`;
    }

    if (tone !== "na") {
      return `gantt-bar-fill status-${tone}`;
    }

    if (progress >= 100) {
      return "gantt-bar-fill status-complete";
    }
    return progress > 0
      ? "gantt-bar-fill status-pending"
      : "gantt-bar-fill status-na";
  }

  toggleLevel1(event) {
    if (!this.supportsLevel2) return;
    if (!this._validateL2Config()) return;

    const id = event.currentTarget.dataset.id;
    const index = this.sourceLevel1Data.findIndex(
      (item) => item.record.Id === id
    );
    if (index === -1) return;

    const item = this.sourceLevel1Data[index];
    if (item.expanded) {
      this._updateSourceLevel1(index, {
        ...item,
        expanded: false,
        rowClass: "l1-item",
        iconClass: "expand-icon"
      });
      this._refreshView();
      return;
    }

    if (item._l2Loaded || (item.children && item.children.length > 0)) {
      this._updateSourceLevel1(index, {
        ...item,
        expanded: true,
        rowClass: "l1-item expanded-row",
        iconClass: "expand-icon open"
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
          hasChildren: children && children.length > 0,
          expanded: true,
          rowClass: "l1-item expanded-row",
          iconClass: "expand-icon open"
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
    if (
      !this.supportsLevel3 ||
      !this.level3Object ||
      !this.level3ParentLookup
    ) {
      return;
    }

    const l2Id = event.currentTarget.dataset.id;
    const l1Id = event.currentTarget.dataset.parent;
    const l1Index = this.sourceLevel1Data.findIndex(
      (item) => item.record.Id === l1Id
    );
    if (l1Index === -1) return;

    const l1Item = this.sourceLevel1Data[l1Index];
    const l2Index = (l1Item.children || []).findIndex(
      (item) => item.record.Id === l2Id
    );
    if (l2Index === -1) return;

    const l2Item = l1Item.children[l2Index];
    if (l2Item.expanded) {
      this._updateSourceL2(l1Index, l2Index, {
        ...l2Item,
        expanded: false,
        rowClass: "l2-row",
        iconClass: "expand-icon"
      });
      this._refreshView();
      return;
    }

    if (l2Item.children && l2Item.children.length > 0) {
      this._updateSourceL2(l1Index, l2Index, {
        ...l2Item,
        expanded: true,
        rowClass: "l2-row expanded-row",
        iconClass: "expand-icon open"
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
          rowClass: "l2-row expanded-row",
          iconClass: "expand-icon open"
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

  // REPLACE handleLevel1Click with:
handleLevel1Click(event) {
  if (this.suppressBarClick) {
    this.suppressBarClick = false;
    return;
  }
  event.stopPropagation();
  const id = event.currentTarget.dataset.id;
  this.selectedRecordId = id;
  this.selectedObjectApi = this.level1Object;
  this.selectedLevel = 1;
  const sec1Fields = this._parseFields(this.level1Section1Fields);
  const sec2Fields = this._parseFields(this.level1Section2Fields);
  this.section1 = { name: this.level1Section1Name, fields: sec1Fields };
  this.section2 = { name: this.level1Section2Name, fields: sec2Fields };
  this.isEditMode = false;
  this.selectedItemCache = this._buildSelectedItemCache(
    id, 1, this.level1Object,
    this.level1Section1Name, sec1Fields,
    this.level1Section2Name, sec2Fields
  );
}

  // REPLACE handleItemClick with:
handleItemClick(event) {
  if (this.suppressBarClick) {
    this.suppressBarClick = false;
    return;
  }
  event.stopPropagation();
  const id = event.currentTarget.dataset.id;
  const level = parseInt(event.currentTarget.dataset.level, 10);
  const objectApi = level === 3 ? this.level3Object : this.level2Object;
  const sec1Name = level === 3 ? this.level3Section1Name : this.level2Section1Name;
  const sec2Name = level === 3 ? this.level3Section2Name : this.level2Section2Name;
  const sec1Fields = this._parseFields(level === 3 ? this.level3Section1Fields : this.level2Section1Fields);
  const sec2Fields = this._parseFields(level === 3 ? this.level3Section2Fields : this.level2Section2Fields);
  this.selectedRecordId = id;
  this.selectedLevel = level;
  this.selectedObjectApi = objectApi;
  this.section1 = { name: sec1Name, fields: sec1Fields };
  this.section2 = { name: sec2Name, fields: sec2Fields };
  this.isEditMode = false;
  this.selectedItemCache = this._buildSelectedItemCache(
    id, level, objectApi,
    sec1Name, sec1Fields,
    sec2Name, sec2Fields
  );
}

  handleBarDragStart(event) {
    if (event.button !== 0 || this.isSavingChange) {
      return;
    }

    const path = event.composedPath ? event.composedPath() : [event.target];
    let mode = "move";
    if (
      path.some(
        (el) => el.classList && el.classList.contains("drag-handle-left")
      )
    ) {
      mode = "resize-start";
    } else if (
      path.some(
        (el) => el.classList && el.classList.contains("drag-handle-right")
      )
    ) {
      mode = "resize-end";
    } else {
      const rect = event.currentTarget.getBoundingClientRect();
      const edgeThreshold = Math.min(30, Math.max(12, rect.width * 0.2));
      const offsetX = event.clientX - rect.left;
      if (offsetX <= edgeThreshold) {
        mode = "resize-start";
      } else if (rect.right - event.clientX <= edgeThreshold) {
        mode = "resize-end";
      }
    }

    const id = event.currentTarget.dataset.id;
    const level = parseInt(event.currentTarget.dataset.level || "1", 10);
    const item = this._findItem(id, level);
    if (!item || !this.startDateLimit || !this.endDateLimit) {
      return;
    }

    const originalDates = this._buildShiftedDatesForItem(item.record, level, 0);
    if (!originalDates.actualStart && !originalDates.plannedStart) {
      return;
    }

    const pxPerDay = this._getPixelsPerDay();
    if (pxPerDay <= 0) {
      return;
    }

    this.dragState = {
      id,
      level,
      mode,
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

    const dayOffset = Math.round(
      (event.clientX - this.dragState.startX) / this.dragState.pxPerDay
    );
    if (dayOffset === this.dragState.movedDays) {
      return;
    }

    this.dragState.movedDays = dayOffset;
    this.dragState.didDrag = true;
    this._applyDragPreview(this.dragState.id, this.dragState.level, dayOffset);
    this._updateDragTooltip(event, dayOffset);
  }

  _updateDragTooltip(event, dayOffset) {
    if (!this.dragState) return;
    const { id, level, mode } = this.dragState;
    const item = this._findItem(id, level);
    if (!item) return;
    const shifted = this._buildShiftedDatesForMode(
      item.record,
      level,
      dayOffset,
      mode
    );
    let label, date;
    if (mode === "resize-start") {
      label = "START DATE";
      date = shifted.actualStart;
    } else if (mode === "resize-end") {
      label = "END DATE";
      date = shifted.actualEnd;
    } else {
      label = "START DATE";
      date = shifted.actualStart;
    }
    const vw = window.innerWidth || 640;
    const x = Math.min(event.clientX + 10, vw - 118);
    const y = Math.max(event.clientY - 42, 8);
    this.dragTooltip = {
      visible: true,
      label,
      dateStr: this._formatDate(date),
      style: `left:${x}px;top:${y}px;`
    };
  }

  async handleBarDragEnd() {
    if (!this.dragState) {
      return;
    }

    this.dragTooltip = { visible: false, label: "", dateStr: "", style: "" };
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

    const mode = drag.mode || "move";
    const shiftedDates = this._buildShiftedDatesForMode(
      item.record,
      drag.level,
      drag.movedDays,
      mode
    );
    const before = this._buildFieldValueMapFromDates(
      drag.level,
      drag.originalDates
    );
    const after = this._buildFieldValueMapFromDates(drag.level, shiftedDates);

    const changes = [];
    if (mode === "move" || mode === "resize-start") {
      changes.push({
        key: "start",
        label: "Start Date",
        before: this._formatDate(
          drag.originalDates.actualStart || drag.originalDates.plannedStart
        ),
        after: this._formatDate(
          shiftedDates.actualStart || shiftedDates.plannedStart
        )
      });
    }
    if (mode === "move" || mode === "resize-end") {
      changes.push({
        key: "end",
        label: "End Date",
        before: this._formatDate(
  drag.originalDates.actualEnd || drag.originalDates.plannedEnd
),
after: this._formatDate(
  shiftedDates.actualEnd || shiftedDates.plannedEnd
)
      });
    }

    const absDays = Math.abs(drag.movedDays);
    const dir = drag.movedDays > 0 ? "later" : "earlier";
    const description =
      mode === "resize-start"
        ? `Shift start date by ${absDays} day(s) ${dir}?`
        : mode === "resize-end"
          ? `Shift end date by ${absDays} day(s) ${dir}?`
          : `Move this item by ${drag.movedDays} day(s)?`;

    this.dragConfirm = {
      visible: true,
      id: drag.id,
      level: drag.level,
      objectApi: drag.objectApi,
      movedDays: drag.movedDays,
      itemLabel: item.record?.Name || "Record",
      before,
      after,
      changes,
      description
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

  undoInlineEdit() {
    const inputFields = this.template.querySelectorAll("lightning-input-field");
    if (inputFields) {
      inputFields.forEach((field) => field.reset());
    }
  }

  saveInlineEdit() {
    const form = this.template.querySelector(".modal-edit-form");
    if (form) {
      form.submit();
    }
  }

  handleInlineEditSubmit(event) {
    event.preventDefault();
    const fields = { ...(event.detail?.fields || {}) };
    const level = this.selectedLevel || this.inlineEditBaseline?.level || 1;
    const recordId = this.selectedRecordId || this.inlineEditBaseline?.recordId;
    const normalizedFields = this._augmentFieldValuesForStatus(
      fields,
      level,
      recordId
    );
    const values = {};
    Object.keys(normalizedFields).forEach((fieldName) => {
      const raw = normalizedFields[fieldName];
      values[fieldName] =
        raw && typeof raw === "object" && "value" in raw ? raw.value : raw;
    });
    this.inlineEditPendingValues = values;

    const form = this.template.querySelector(".modal-edit-form");
    if (form) {
      form.submit(normalizedFields);
    }
  }

  handleInlineEditSuccess(event) {
    const baseline = this.inlineEditBaseline;
    const after = this.inlineEditPendingValues || {};

    // If programmatic submit bypassed onsubmit, or as a fallback, pull from success event
    if (event && event.detail && event.detail.fields) {
      const successFields = event.detail.fields;
      Object.keys(successFields).forEach((key) => {
        const valObj = successFields[key];
        after[key] =
          valObj && typeof valObj === "object" && "value" in valObj
            ? valObj.value
            : valObj;
      });
    }

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
  }

  handleInlineEditError(event) {
    const message = event?.detail?.message || "Failed to save record changes.";
    this.errorMessage = message;
  }
_buildOverdueRisk(record, level) {
  const today      = this._getCurrentDate();
  const targetEnd  = this._getTargetEndDate(record, level);
  const plannedEnd = this._getPlannedEndDate(record, level);
  const deadLine   = targetEnd || plannedEnd;
  if (!deadLine || deadLine.getTime() >= today.getTime()) return null;

  const daysLate = Math.ceil((today.getTime() - deadLine.getTime()) / DAY_MS);
  return {
    isOverdue:   true,
    daysLate,
    deadlineStr: this._formatDate(deadLine),
    description: `Target end date was ${this._formatDate(deadLine)} — this record is ${daysLate} day${daysLate === 1 ? '' : 's'} overdue.`
  };
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
        // Reload chart data to reflect the undo changes
        this._reloadChartData(true);
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
  this.selectedItemCache = null;   // <-- ADD THIS LINE
}
  handleBackdropClick() {
    this.closeModal();
  }

  stopPropagation(event) {
    event.stopPropagation();
  }

 handleSearchInput(event) {
  event.stopPropagation();
  const val = (event.target.value || "").trim().toLowerCase();
  this.searchTerm = val;
  this._prepareHierarchyForQuery().then(() => this._refreshView());
}

handleSearchClear(event) {
  event.stopPropagation();
  event.preventDefault();
  this.searchTerm = "";
  const searchInput = this.template.querySelector(".filter-search");
  if (searchInput) searchInput.value = "";
  this._refreshView();
}

  handleBarHover(event) {
    if (this.dragState) {
      return;
    }
    const id = event.currentTarget.dataset.id;
    const level = parseInt(event.currentTarget.dataset.level || "1", 10);
    const item = this._findItem(id, level);
    if (!item) {
      return;
    }

    const details = [
      {
        key: "status",
        label: "Status",
        value:
          this._getStatusLabel(this._getStatusValue(item.record, this._getStatusField(level))) ||
          "N/A"
      },
      {
        key: "start",
        label: "Start",
        value: this._formatDate(this._getItemStartDate(item, level))
      },
      {
        key: "end",
        label: "End",
        value: this._formatDate(this._getItemEndDate(item, level))
      },
      { key: "duration", label: "Duration", value: item.duration || "N/A" },
      { key: "owner", label: "Owner", value: item.ownerName || "N/A" }
    ];

    this.tooltip = {
      visible: true,
      title: item.record?.Name || "Record",
      details,
      style: this._buildTooltipStyle(event)
    };
  }

  handleBarMove(event) {
    if (this.dragState || !this.tooltip.visible) {
      return;
    }
    this.tooltip = {
      ...this.tooltip,
      style: this._buildTooltipStyle(event)
    };
  }

  handleTargetHover(event) {
    if (this.dragState) {
      return;
    }
    event.stopPropagation();
    const id = event.currentTarget.dataset.id;
    const level = parseInt(event.currentTarget.dataset.level || "1", 10);
    const item = this._findItem(id, level);
    if (!item) {
      return;
    }

    const targetEnd = this._getTargetEndDate(item.record, level);
    this.tooltip = {
      visible: true,
      title: item.record?.Name || "Record",
      details: [
        {
          key: "targetEnd",
          label: "Target End",
          value: this._formatDate(targetEnd)
        }
      ],
      style: this._buildTooltipStyle(event)
    };
  }

  handleTargetMove(event) {
    event.stopPropagation();
    if (this.dragState || !this.tooltip.visible) {
      return;
    }
    this.tooltip = {
      ...this.tooltip,
      style: this._buildTooltipStyle(event)
    };
  }

  hideTooltip() {
    if (this.dragState) {
      return;
    }
    if (this.tooltip.visible) {
      this.tooltip = { visible: false, title: "", details: [], style: "" };
    }
  }

  _applySearch(term) {
    this.searchTerm = (term || "").toLowerCase();
    this._prepareHierarchyForQuery()
      .then(() => {
        this._refreshView();
      })
      .catch(() => {
        this._refreshView();
      });
  }

  _augmentFieldValuesForStatus(fields, level, recordId) {
    const nextFields = { ...(fields || {}) };
    const statusField = this._getStatusField(level);
    if (!statusField || !(statusField in nextFields)) {
      return nextFields;
    }

    const item = this._findItem(recordId, level);
    const record = item?.record;
    const normalizedStatus = String(nextFields[statusField] || "")
      .trim()
      .toLowerCase();
    const actualStartField = this._getActualStartField(level);
    const actualEndField = this._getActualEndField(level);
    const today = this._formatDateForApex(this._getCurrentDate());
    const seedStartDate =
      this._getPlannedStartDate(record, level) ||
      this._getActualStartDate(record, level) ||
      this._getCurrentDate();
    const seedStartDateValue = this._formatDateForApex(seedStartDate);

    const isNotStarted =
      normalizedStatus.includes("new") ||
      normalizedStatus.includes("not") ||
      normalizedStatus.includes("open") ||
      normalizedStatus.includes("todo") ||
      normalizedStatus.includes("draft") ||
      normalizedStatus.includes("queued");
    const isStarted = !isNotStarted && !!normalizedStatus;
    const isComplete =
      normalizedStatus.includes("complete") ||
      normalizedStatus.includes("completed") ||
      normalizedStatus.includes("done") ||
      normalizedStatus.includes("closed") ||
      normalizedStatus.includes("finished") ||
      normalizedStatus.includes("resolved") ||
      normalizedStatus.includes("approved");

    if (actualStartField && !nextFields[actualStartField]) {
      nextFields[actualStartField] = seedStartDateValue;
    }

    if (actualEndField && normalizedStatus) {
      nextFields[actualEndField] = today;
    }

    return nextFields;
  }

  handleStatusFilterChange(event) {
    this.statusFilter = event.detail?.value || event.target?.value || "all";
    this._refreshView();
    this.initTimeline();
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => this.scrollToToday(), 50);
  }

  handleOwnerFilterChange(event) {
    this.ownerFilter = event.detail?.value || event.target?.value || "all";
    this._refreshView();
    this.initTimeline();
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => this.scrollToToday(), 50);
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
    const sidebar = this.template.querySelector(".gantt-table-body");
    const header = this.template.querySelector(".timeline-header-scroll");
    if (sidebar && sidebar.scrollTop !== event.target.scrollTop) {
      sidebar.scrollTop = event.target.scrollTop;
    }
    if (header && header.scrollLeft !== event.target.scrollLeft) {
      header.scrollLeft = event.target.scrollLeft;
    }
  }

  syncSidebarScroll(event) {
    const timeline = this.template.querySelector(".timeline-body-viewport");
    if (timeline && timeline.scrollTop !== event.target.scrollTop) {
      timeline.scrollTop = event.target.scrollTop;
    }
  }

  collapseAll() {
    if (!this.supportsLevel2 || !this.sourceLevel1Data.length) return;
    this.sourceLevel1Data = this.sourceLevel1Data.map((item) => ({
      ...item,
      expanded: false,
      iconClass: "expand-icon",
      rowClass: "l1-item",
      children: (item.children || []).map((child) => ({
        ...child,
        expanded: false,
        iconClass: "expand-icon",
        rowClass: "l2-row"
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
          rowClass: "l1-item expanded-row",
          iconClass: "expand-icon open"
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
          hasChildren: children && children.length > 0,
          expanded: true,
          rowClass: "l1-item expanded-row",
          iconClass: "expand-icon open"
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
    if (
      !this.supportsLevel2 ||
      !this._hasActiveQuery() ||
      !this.sourceLevel1Data.length
    ) {
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
            children,
            hasChildren: children && children.length > 0
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
    return (
      !!this.searchTerm ||
      this.statusFilter !== "all" ||
      this.ownerFilter !== "all"
    );
  }

  reloadChart() {
    this.level1Data = [];
    this.sourceLevel1Data = [];
    this.errorMessage = "";
    this.matchCount = 0;
    this.tooltip = { visible: false, title: "", details: [], style: "" };
    this.isLoading = true;
    this.initTimeline();
    this.loadOrgToday();
    this.loadOwners();
    this.loadStatusOptions();
    this.loadLevel1();
  }

  // Renamed — called by JPG menu item
async exportAsJPG() {
  this.exportMenuOpen = false;
  try {
    const rows = await this._getExpandedCanvasRows();
    const canvas = this._renderChartToCanvas(rows);
    const link   = document.createElement('a');
    link.href     = canvas.toDataURL('image/jpeg', 0.95);
    link.download = `${this._safeFileName()}.jpg`;
    link.click();
  } catch (error) {
    this.errorMessage = `JPG export failed: ${error.message}`;
  }
}

// New — PDF export
async exportAsPDF() {
  this.exportMenuOpen = false;
  try {
    const rows = await this._getExpandedCanvasRows();
    const canvas  = this._renderChartToCanvas(rows);
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    // Strip the data URL prefix to get raw base64
    const base64 = imgData.split(',')[1];

    // Canvas dimensions in points (1px ≈ 0.75pt)
    const pxTopt  = 0.75;
    const pdfW    = Math.round(canvas.width  * pxTopt);
    const pdfH    = Math.round(canvas.height * pxTopt);

    const pdf = this._buildMinimalPDF(base64, pdfW, pdfH, canvas.width, canvas.height);

    // Trigger download
    const blob = new Blob([pdf], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `${this._safeFileName()}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (error) {
    this.errorMessage = `PDF export failed: ${error.message}`;
  }
}

async _getExpandedCanvasRows() {
  const expandedTree = await Promise.all(
    (this.sourceLevel1Data || []).map((l1) => this._buildExpandedExportL1(l1))
  );
  return this._collectCanvasRows(this._buildExpandedExportView(expandedTree));
}

async _buildExpandedExportL1(l1) {
  let children = l1.children || [];

  if (this.supportsLevel2 && this._validateL2Config()) {
    children = children.length ? children : await this._loadLevel2(l1.record.Id);

    if (this.supportsLevel3 && this.level3Object && this.level3ParentLookup) {
      children = await Promise.all(
        children.map(async (l2) => {
          const level3Children = (l2.children || []).length
            ? l2.children
            : await this._loadLevel3(l2.record.Id);
          return {
            ...l2,
            expanded: true,
            rowClass: "l2-row expanded-row",
            iconClass: "expand-icon open",
            children: level3Children
          };
        })
      );
    }
  }

  return {
    ...l1,
    expanded: children.length > 0,
    rowClass: children.length > 0 ? "l1-item expanded-row" : "l1-item",
    iconClass: children.length > 0 ? "expand-icon open" : "expand-icon",
    children
  };
}

_buildExpandedExportView(level1Items) {
  const buildLevel3 = (item) => {
    const visible =
      this._matchesStatus(item.record, this.level3Progress) &&
      this._matchesOwner(item) &&
      this._recordMatchesAdvancedFilters(item.record);
    return visible ? item : null;
  };

  const buildLevel2 = (item) => {
    const children = (item.children || []).map(buildLevel3).filter(Boolean);
    const directVisible =
      this._matchesStatus(item.record, this.level2Progress) &&
      this._matchesOwner(item) &&
      this._recordMatchesAdvancedFilters(item.record);
    if (!directVisible && children.length === 0) return null;
    return {
      ...item,
      expanded: children.length > 0,
      rowClass: children.length > 0 ? "l2-row expanded-row" : "l2-row",
      iconClass: children.length > 0 ? "expand-icon open" : "expand-icon",
      children
    };
  };

  return (level1Items || [])
    .map((item) => {
      const children = (item.children || []).map(buildLevel2).filter(Boolean);
      const directVisible =
        this._matchesStatus(item.record, this.level1Progress) &&
        this._matchesOwner(item) &&
        this._recordMatchesAdvancedFilters(item.record);
      if (!directVisible && children.length === 0) return null;
      return {
        ...item,
        expanded: children.length > 0,
        rowClass: children.length > 0 ? "l1-item expanded-row" : "l1-item",
        iconClass: children.length > 0 ? "expand-icon open" : "expand-icon",
        children
      };
    })
    .filter(Boolean);
}

_collectCanvasRows(level1Items) {
  const rows = [];
  for (const l1 of level1Items || []) {
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
  return rows;
}

_buildMinimalPDF(base64jpeg, pdfW, pdfH, imgPxW, imgPxH) {
  // Minimal valid PDF structure — no external dependency
  const imgData   = atob(base64jpeg);
  const imgLen    = imgData.length;

  // Build byte array from decoded base64
  const imgBytes  = new Uint8Array(imgLen);
  for (let i = 0; i < imgLen; i++) {
    imgBytes[i] = imgData.charCodeAt(i);
  }

  // PDF objects as strings
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfW} ${pdfH}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>\nendobj\n`;
  const streamContent = `q\n${pdfW} 0 0 ${pdfH} 0 0 cm\n/Im1 Do\nQ\n`;
  const obj4 = `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`;

  // Build image XObject — must be binary, so we assemble carefully
  const imgHeader = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgPxW} /Height ${imgPxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgLen} >>\nstream\n`;
  const imgFooter = `\nendstream\nendobj\n`;

  // Calculate byte offsets for xref
  const enc     = new TextEncoder();
  const hdr     = enc.encode('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');
  const b1      = enc.encode(obj1);
  const b2      = enc.encode(obj2);
  const b3      = enc.encode(obj3);
  const b4      = enc.encode(obj4);
  const bih     = enc.encode(imgHeader);
  const bif     = enc.encode(imgFooter);

  const off1    = hdr.length;
  const off2    = off1 + b1.length;
  const off3    = off2 + b2.length;
  const off4    = off3 + b3.length;
  const off5    = off4 + b4.length;

  const xref =
    `xref\n0 6\n0000000000 65535 f \n` +
    `${String(off1).padStart(10,'0')} 00000 n \n` +
    `${String(off2).padStart(10,'0')} 00000 n \n` +
    `${String(off3).padStart(10,'0')} 00000 n \n` +
    `${String(off4).padStart(10,'0')} 00000 n \n` +
    `${String(off5).padStart(10,'0')} 00000 n \n`;

  const totalLen = off5 + bih.length + imgLen + bif.length;
  const trailer  = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${totalLen}\n%%EOF`;

  // Assemble final PDF as Uint8Array
  const bXref   = enc.encode(xref);
  const bTrail  = enc.encode(trailer);
  const total   = hdr.length + b1.length + b2.length + b3.length + b4.length +
                  bih.length + imgLen + bif.length + bXref.length + bTrail.length;
  const out     = new Uint8Array(total);
  let pos = 0;
  const write = (arr) => { out.set(arr, pos); pos += arr.length; };
  write(hdr); write(b1); write(b2); write(b3); write(b4);
  write(bih); write(imgBytes); write(bif);
  write(bXref); write(bTrail);

  return out;
}
// Helper — sanitised file name
_safeFileName() {
  return (this.displayTitle || 'gantt-chart')
    .replace(/[^a-z0-9-_]+/gi, '_')
    .toLowerCase();
}

  toggleFullscreen() {
    if (this.isFullscreen) {
      this._exitFullscreen();
      return;
    }
    this.isFullscreen = true;
    document.body.style.overflow = "hidden";
  }

  handleFullscreenChange() {
    // Keep fallback class mode authoritative for consistent behavior in Lightning containers.
  }

  handleScaleChange(event) {
    this.timelineScale = event.detail?.value || event.target?.value || "months";
    this.initTimeline();
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => this.scrollToToday(), 50);
  }
  parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === "string") {
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
    return parsed instanceof Date && !Number.isNaN(parsed.getTime())
      ? parsed
      : null;
  }

  _parseApexDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === "string") {
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
    document.body.style.overflow = "";
  }

  calculateDuration(start, end) {
    if (
      !start ||
      !end ||
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    )
      return "--";
    const weeks = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24 * 7));
    return weeks > 0 ? `${weeks}w` : "<1w";
  }

  calculateBarStyle(start, end) {
    try {
      if (!start || Number.isNaN(start?.getTime?.())) return "display:none;";
      const timelineStart = this.startDateLimit.getTime();
      const timelineEnd = this.endDateLimit.getTime();
      const total = timelineEnd - timelineStart;
      if (total <= 0) return "display:none;";

      const leftPct = Math.max(
        0,
        ((start.getTime() - timelineStart) / total) * 100
      );
      const endTime =
        end && !Number.isNaN(end?.getTime?.())
          ? end.getTime() + DAY_MS
          : start.getTime() + DAY_MS;
      const durationMs = Math.max(
        DAY_MS,
        Math.max(0, endTime - start.getTime())
      );
      const widthPct = Math.max(1.5, (durationMs / total) * 100);
      return `left:${leftPct.toFixed(2)}%; width:${widthPct.toFixed(2)}%;`;
    } catch {
      return "display:none;";
    }
  }

  calculateTargetMarkerStyle(targetEnd) {
    try {
      if (!targetEnd || Number.isNaN(targetEnd?.getTime?.()))
        return "display:none;";
      const timelineStart = this.startDateLimit.getTime();
      const timelineEnd = this.endDateLimit.getTime();
      const total = timelineEnd - timelineStart;
      if (total <= 0) return "display:none;";

      const offsetPct =
        ((targetEnd.getTime() + DAY_MS - timelineStart) / total) * 100;
      return `left:${Math.max(0, Math.min(100, offsetPct)).toFixed(2)}%; display:block;`;
    } catch {
      return "display:none;";
    }
  }

  _calculateTargetMarkerStyleFromBarStyle(barStyle, fallbackDate) {
    const leftMatch = String(barStyle || "").match(/left:([0-9.]+)%/);
    const widthMatch = String(barStyle || "").match(/width:([0-9.]+)%/);
    if (leftMatch && widthMatch) {
      const left = parseFloat(leftMatch[1]);
      const width = parseFloat(widthMatch[1]);
      return `left:${Math.max(0, Math.min(100, left + width)).toFixed(2)}%; display:block;`;
    }
    return this.calculateTargetMarkerStyle(fallbackDate);
  }

  _getPixelsPerDay() {
    if (!this.startDateLimit || !this.endDateLimit) {
      return 0;
    }
    const totalMs = this.endDateLimit.getTime() - this.startDateLimit.getTime();
    if (totalMs <= 0) {
      return 0;
    }
    const totalWidth = Math.max(
      this.timelineMonths.length * this.timelineUnitWidthPx,
      this.timelineUnitWidthPx
    );
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
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  _getObjectApiByLevel(level) {
    if (level === 1) return this.level1Object;
    if (level === 2) return this.level2Object;
    return this.level3Object;
  }

  _buildShiftedDatesForItem(record, level, days) {
    const plannedStart = this._shiftDate(
      this._getPlannedStartDate(record, level),
      days
    );
    const plannedEnd = this._shiftDate(
      this._getPlannedEndDate(record, level),
      days
    );
    const actualStart = this._shiftDate(
      this._getActualStartDate(record, level),
      days
    );
    const actualEnd = this._shiftDate(
      this._getActualEndDate(record, level),
      days
    );
    const targetEnd = this._shiftDate(
      this._getTargetEndDate(record, level),
      days
    );
    return { plannedStart, plannedEnd, actualStart, actualEnd, targetEnd };
  }

  _buildShiftedDatesForMode(record, level, days, mode) {
    const plannedStart = this._getPlannedStartDate(record, level);
    const plannedEnd = this._getPlannedEndDate(record, level);
    const actualStart = this._getActualStartDate(record, level);
    const actualEnd = this._getActualEndDate(record, level);
    const targetEnd = this._getTargetEndDate(record, level);

    // Helper to pick base start/end for operations (prefer actual, fall back to planned)
    const baseStart = actualStart || plannedStart || null;
    const baseEnd = actualEnd || plannedEnd || null;

    if (mode === "resize-start") {
      let nextBaseStart = this._shiftDate(baseStart, days);
      if (
        nextBaseStart &&
        baseEnd &&
        nextBaseStart.getTime() > baseEnd.getTime()
      ) {
        nextBaseStart = new Date(baseEnd.getTime());
      }
      // If actual start is present on the record, update actualStart; otherwise update plannedStart
      if (actualStart) {
        return {
          plannedStart,
          plannedEnd,
          actualStart: nextBaseStart,
          actualEnd,
          targetEnd
        };
      }
      return {
        plannedStart: nextBaseStart,
        plannedEnd,
        actualStart,
        actualEnd,
        targetEnd
      };
    }

    if (mode === "resize-end") {
  let nextBaseEnd = this._shiftDate(baseEnd, days);
  if (
    baseStart &&
    nextBaseEnd &&
    nextBaseEnd.getTime() < baseStart.getTime()
  ) {
    nextBaseEnd = new Date(baseStart.getTime());
  }
  return {
    plannedStart,
    plannedEnd,
    actualStart,
    actualEnd: nextBaseEnd,
    targetEnd: targetEnd ? this._shiftDate(targetEnd, days) : null
  };
}

    // move: shift whichever fields exist (both planned and actual will be shifted by _buildShiftedDatesForItem)
    return this._buildShiftedDatesForItem(record, level, days);
  }

  _buildFieldValueMapFromDates(level, dates) {
    const values = {};
    const setIfField = (fieldName, dateValue) => {
      if (!fieldName || !dateValue) {
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

  _getStatusColor(statusValue) {
    const normalized = String(statusValue || "")
      .trim()
      .toLowerCase();
    let tone = this._getConfiguredTone(normalized) || "";
    if (!tone) {
      const fallbackFillClass = this._barFillClass(statusValue, 0);
      tone = String(fallbackFillClass).match(/status-([a-z-]+)/)?.[1] || "";
    }
    if (tone === "not-started") return "color: #0055b3;";
    if (tone === "progress" || tone === "pending") return "color: #f59e0b;";
    if (tone === "complete") return "color: #15803d;";
    if (tone === "risk") return "color: #c75c00;";
    return "";
  }

  _buildProgressStyle(progress, statusValue) {
    const width = progress > 0 ? progress : statusValue ? 100 : 0;
    return `width: ${Math.max(0, Math.min(100, width))}%;`;
  }

  _calculateOutlineBarStyle(start, end) {
    return this.calculateBarStyle(start, end);
  }

  _barToneClass(fillClass) {
    const tone = String(fillClass || "").match(/status-([a-z-]+)/)?.[1];
    return tone ? `bar-tone-${tone}` : "bar-tone-na";
  }

  _getBarPixelWidth(start, end) {
    if (!start || !this.startDateLimit || !this.endDateLimit) {
      return 0;
    }
    const timelineRange =
      this.endDateLimit.getTime() - this.startDateLimit.getTime();
    if (timelineRange <= 0) {
      return 0;
    }
    const endTime =
      end && !Number.isNaN(end?.getTime?.())
        ? end.getTime() + DAY_MS
        : start.getTime() + DAY_MS;
    const durationMs = Math.max(DAY_MS, Math.max(0, endTime - start.getTime()));
    const chartWidth = Math.max(
      this.timelineMonths.length * this.timelineUnitWidthPx,
      this.timelineUnitWidthPx
    );
    return (durationMs / timelineRange) * chartWidth;
  }

  _getStatusLabelClass(statusValue, start, end) {
    const label = String(statusValue || "").trim();
    const estimatedLabelWidth = label.length * 6.8 + 22;
    return this._getBarPixelWidth(start, end) < estimatedLabelWidth
      ? "bar-status-label compact"
      : "bar-status-label";
  }

  _applyDragPreview(recordId, level, days) {
    const item = this._findItem(recordId, level);
    if (!item) {
      return;
    }
    const mode = this.dragState?.mode || "move";
    const shiftedDates = this._buildShiftedDatesForMode(
      item.record,
      level,
      days,
      mode
    );
    const nextDuration = this.calculateDuration(
      shiftedDates.actualStart || shiftedDates.plannedStart,
      shiftedDates.actualEnd || shiftedDates.plannedEnd
    );
    const nextBarStyle = this.calculateBarStyle(
      shiftedDates.actualStart || shiftedDates.plannedStart,
      shiftedDates.actualEnd || shiftedDates.plannedEnd
    );
    const nextPlanStyle = this._calculateOutlineBarStyle(
      shiftedDates.plannedStart,
      shiftedDates.targetEnd || shiftedDates.plannedEnd
    );
    const nextTargetStyle = this._calculateTargetMarkerStyleFromBarStyle(
      nextPlanStyle,
      shiftedDates.targetEnd || shiftedDates.plannedEnd
    );

    const updater = (entry) => {
      if (!entry || !entry.record || entry.record.Id !== recordId) {
        return entry;
      }
      const statusVal = this._getStatusValue(
        entry.record,
        this._getStatusField(level)
      );
      const prog = Math.min(Math.max(entry.progress || 0, 0), 100);
      const nextFillClass = this._barFillClass(statusVal, prog);
      const nextProgressStyle = this._buildProgressStyle(prog, statusVal) + this._getBarColorOverride(statusVal);
      const baseBarClass = String(
        entry.barClass || "gantt-bar-item actual-bar-item"
      )
        .split(/\s+/)
        .filter((className) => className && !className.startsWith("bar-tone-"))
        .join(" ");
      const nextBarClass =
        `${baseBarClass} ${this._barToneClass(nextFillClass)}`.trim();
      const nextActualEnd = shiftedDates.actualEnd || shiftedDates.plannedEnd;
      return {
        ...entry,
        duration: nextDuration,
        barStyle: nextBarStyle,
        plannedBarStyle: nextPlanStyle,
        targetEndStyle: nextTargetStyle,
        statusLabelClass: this._getStatusLabelClass(
          statusVal,
          shiftedDates.actualStart,
          shiftedDates.actualEnd
        ),
        fillClass: nextFillClass,
        progressStyle: nextProgressStyle,
        barClass: nextBarClass,
        hoverText: this._buildHoverText(
          entry.record,
          level,
          statusVal,
          shiftedDates.actualStart,
          nextActualEnd,
          nextDuration,
          prog
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

    const before = drag.before;
    const after = drag.after;

    this.isSavingChange = true;
    updateRecordFields({
      objectName: drag.objectApi,
      recordId: drag.id,
      fieldValues: after
    })
      .then(() => {
        // Update change history
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

        // After Apex update succeeds, reload the chart data from Salesforce
        // This ensures we get fresh records with the updated field values
        this._reloadChartData(true);

        // Close modal after successful drag
        this.selectedRecordId = null;
        this.isEditMode = false;
      })
      .catch((error) => {
        this.errorMessage = `Failed to update dates: ${this._msg(error)}`;
        this._refreshBarsForCurrentScale();
      })
      .finally(() => {
        this.isSavingChange = false;
      });
  }

_reloadChartData(preserveScroll = false) {
  if (!this.level1Object) return;

  const expandedL1Ids = new Set(
    (this.sourceLevel1Data || [])
      .filter((item) => item.expanded)
      .map((item) => item.record?.Id)
      .filter(Boolean)
  );

  const filterFields = this._getActiveFilterFieldNames();
  const fields = [
    this.level1DisplayField,
    this.level1StartDate,
    this.level1EndDate,
    this.level1PlannedStartDate,
    this.level1PlannedEndDate,
    this.level1ActualStartDate,
    this.level1ActualEndDate,
    this.level1TargetEndDate,
    this.level1Progress,
    ...filterFields              // ← ADD THIS
  ].filter(Boolean);

  const uniqueFields = [...new Set(fields)].join(",");

  getGanttData({
    objectName: this.level1Object,
    fields: uniqueFields,        // ← use uniqueFields
    // ... rest unchanged
    lookupField: "",
    parentId: "",
    statusField: this.level1Progress || "",
    startDateField: this.level1StartDate || "",
    searchTerm: this.searchTerm || "",
    specificRecordId: this.isCurrentRecordScope ? this.recordId : ""
  })
  .then((result) => {
    this.sourceLevel1Data = (result || []).map(item => this._wrapL1(item));
    if (this.supportsLevel2) {
    const l2Loads = this.sourceLevel1Data
      .filter(item => expandedL1Ids.has(item.record.Id))
      .map((item) => {
        const idx = this.sourceLevel1Data.findIndex(
          r => r.record.Id === item.record.Id
        );
        return this._loadLevel2(item.record.Id).then(children => {
          const updated = [...this.sourceLevel1Data];
          updated[idx] = {
            ...updated[idx],
            _l2Loaded: true,
            expanded: true,
            rowClass: "l1-item expanded-row",
            children
          };
          this.sourceLevel1Data = updated;
        });
      });
     return Promise.all(l2Loads);
    }
  })
  .then(() => this._refreshView(preserveScroll))   // ← ADD THIS LINE
  .catch(error => {
    this.errorMessage = `Error reloading chart data: ${this._msg(error)}`;
  });
}

  _applyRecordFieldValues(recordId, level, values) {
    const applyToRecord = (entry) => {
      if (!entry || !entry.record || entry.record.Id !== recordId) {
        return entry;
      }
      const nextRecord = { ...entry.record };
      // Apply all field values from the Apex update
      Object.keys(values || {}).forEach((fieldName) => {
        const fieldValue = values[fieldName];
        // Store dates as-is (strings from Apex will be parsed by parseDate when needed)
        nextRecord[fieldName] = fieldValue;
      });
      return { ...entry, record: nextRecord };
    };

    if (level === 1) {
      this.sourceLevel1Data = (this.sourceLevel1Data || []).map((l1) =>
        applyToRecord(l1)
      );
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
      .split(",")
      .map((fieldName) => fieldName.trim())
      .filter(Boolean);
  }

  _nameIncludes(name, term) {
    if (!term) return false;
    return (name || "").toLowerCase().includes(term);
  }

  _msg(error) {
    if (!error) return "Unknown error";
    if (error.body?.message) return error.body.message;
    if (error.message) return error.message;
    try {
      return JSON.stringify(error);
    } catch {
      return "See console";
    }
  }

  _validateL2Config() {
    if (!this.level2Object) {
      this.errorMessage = "Level 2 Object is not configured.";
      return false;
    }
    if (!this.level2ParentLookup) {
      this.errorMessage = "Level 2 Parent Lookup field is not configured.";
      return false;
    }
    if (!this.level2StartDate) {
      this.errorMessage = "Level 2 Start Date field is not configured.";
      return false;
    }
    if (!this.level2EndDate) {
      this.errorMessage = "Level 2 End Date field is not configured.";
      return false;
    }
    return true;
  }
  // ADD this new method before _findRecord():
_buildSelectedItemCache(id, level, objectApi, sec1Name, sec1Fields, sec2Name, sec2Fields) {
  // Search sourceLevel1Data first (always populated, even before _refreshView settles)
  let item = null;
  for (const l1 of this.sourceLevel1Data || []) {
    if (level === 1 && l1.record.Id === id) { item = l1; break; }
    for (const l2 of l1.children || []) {
      if (level === 2 && l2.record.Id === id) { item = l2; break; }
      for (const l3 of l2.children || []) {
        if (level === 3 && l3.record.Id === id) { item = l3; break; }
      }
      if (item) break;
    }
    if (item) break;
  }
  // Fallback to level1Data view copy
  if (!item) item = this._findItem(id, level);
  if (!item) return null;

  const record = item.record || {};
  const statusField = this._getStatusField(level);
  const statusValue = this._getStatusValue(record, statusField);
    const summary = [
    { key: "name",     label: "Name",     value: record.Name || "N/A" },
    {
      key: "progress", label: "Progress",
      value: `${Math.min(Math.max(item.progress || 0, 0), 100)}%`,
      valueStyle: this._getStatusColor(statusValue)
    },
    { key: "status", label: "Status",
  value: this._getStatusLabel(statusValue) || "N/A",
  valueStyle: this._getStatusColor(statusValue)
},
    { key: "start",    label: "Start",    value: this._formatDate(this._getItemStartDate(item, level)) },
    { key: "end",      label: "End",      value: this._formatDate(this._getItemEndDate(item, level)) },
    { key: "duration", label: "Duration", value: item.duration || "N/A" },
    // kept for owner section below — hidden from summary grid
    {
      key: "owner", label: "Owner",
      value: item.ownerName || record.Owner?.Name || "N/A",
      isOwner: true,
      isHidden: true,
      ownerInitials: item.ownerInitials,
      ownerColor: `background-color: ${item.ownerColor}; color: #ffffff;`
    }
  ];

  return {
  summary,
  overdueRisk: this._buildOverdueRisk(record, level),
  section1: { name: sec1Name, fields: sec1Fields },
  section2: { name: sec2Name, fields: sec2Fields }
};
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

    if (this.timelineScale === "years")
      return new Date(anchor.getFullYear(), 0, 1);
    if (this.timelineScale === "quarters") {
      return new Date(
        anchor.getFullYear(),
        Math.floor(anchor.getMonth() / 3) * 3,
        1
      );
    }
    if (this.timelineScale === "months")
      return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    if (this.timelineScale === "weeks") {
      const day = anchor.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const weekStart = new Date(anchor);
      weekStart.setDate(anchor.getDate() + diff);
      return new Date(
        weekStart.getFullYear(),
        weekStart.getMonth(),
        weekStart.getDate()
      );
    }
    return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  }

  _getScaleUnitCount() {
    if (this.timelineScale === "years") return 8;
    if (this.timelineScale === "quarters") return 12;
    if (this.timelineScale === "weeks") return 26;
    if (this.timelineScale === "days") return 60;
    return 18;
  }

  _getTimelineHorizonDate() {
    const timelineDates = this._collectTimelineDates();
    const today = this._getCurrentDate();
    if (!timelineDates.length) {
      return today;
    }
    const maxTimelineDate = new Date(
      Math.max(...timelineDates.map((date) => date.getTime()))
    );
    return maxTimelineDate.getTime() > today.getTime()
      ? maxTimelineDate
      : today;
  }

  _getRequiredScaleUnits(start, end) {
    if (!start || !end) {
      return 1;
    }
    const diffMs = Math.max(0, end.getTime() - start.getTime());
    const monthDiff =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());

    if (this.timelineScale === "years") {
      return Math.max(1, end.getFullYear() - start.getFullYear() + 2);
    }
    if (this.timelineScale === "quarters") {
      return Math.max(1, Math.ceil((monthDiff + 1) / 3) + 1);
    }
    if (this.timelineScale === "months") {
      return Math.max(1, monthDiff + 2);
    }
    if (this.timelineScale === "weeks") {
      return Math.max(1, Math.ceil(diffMs / (DAY_MS * 7)) + 2);
    }
    return Math.max(1, Math.ceil(diffMs / DAY_MS) + 2);
  }

  _addScaleUnits(date, offset) {
    if (this.timelineScale === "years")
      return new Date(date.getFullYear() + offset, 0, 1);
    if (this.timelineScale === "quarters")
      return new Date(date.getFullYear(), date.getMonth() + offset * 3, 1);
    if (this.timelineScale === "months")
      return new Date(date.getFullYear(), date.getMonth() + offset, 1);
    if (this.timelineScale === "weeks") {
      const next = new Date(date);
      next.setDate(next.getDate() + offset * 7);
      return new Date(next.getFullYear(), next.getMonth(), next.getDate());
    }
    const next = new Date(date);
    next.setDate(next.getDate() + offset);
    return new Date(next.getFullYear(), next.getMonth(), next.getDate());
  }

  _formatScaleLabel(date) {
    if (this.timelineScale === "years") return `${date.getFullYear()}`;
    if (this.timelineScale === "quarters")
      return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
    if (this.timelineScale === "months") {
      return date.toLocaleString("default", {
        month: "short",
        year: "numeric"
      });
    }
    if (this.timelineScale === "weeks") {
      const weekEnd = new Date(date);
      weekEnd.setDate(date.getDate() + 6);
      return `${date.toLocaleDateString("default", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("default", { month: "short", day: "numeric" })}`;
    }
    return date.toLocaleDateString("default", {
      month: "short",
      day: "numeric"
    });
  }

  _isCurrentUnit(unitDate, today) {
    if (this.timelineScale === "years")
      return unitDate.getFullYear() === today.getFullYear();
    if (this.timelineScale === "quarters") {
      return (
        unitDate.getFullYear() === today.getFullYear() &&
        Math.floor(unitDate.getMonth() / 3) === Math.floor(today.getMonth() / 3)
      );
    }
    if (this.timelineScale === "months") {
      return (
        unitDate.getFullYear() === today.getFullYear() &&
        unitDate.getMonth() === today.getMonth()
      );
    }
    if (this.timelineScale === "weeks") {
      return (
        this._getWeekStart(unitDate).getTime() ===
        this._getWeekStart(today).getTime()
      );
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
      const l1Start =
        this._getActualStartDate(l1.record, 1) ||
        this._getPlannedStartDate(l1.record, 1);
      const l1End =
        this._getActualEndDate(l1.record, 1) ||
        this._getPlannedEndDate(l1.record, 1) ||
        this._getTargetEndDate(l1.record, 1);
      if (l1Start) dates.push(l1Start);
      if (l1End) dates.push(l1End);
      for (const l2 of l1.children || []) {
        const l2Start =
          this._getActualStartDate(l2.record, 2) ||
          this._getPlannedStartDate(l2.record, 2);
        const l2End =
          this._getActualEndDate(l2.record, 2) ||
          this._getPlannedEndDate(l2.record, 2) ||
          this._getTargetEndDate(l2.record, 2);
        if (l2Start) dates.push(l2Start);
        if (l2End) dates.push(l2End);
        for (const l3 of l2.children || []) {
          const l3Start =
            this._getActualStartDate(l3.record, 3) ||
            this._getPlannedStartDate(l3.record, 3);
          const l3End =
            this._getActualEndDate(l3.record, 3) ||
            this._getPlannedEndDate(l3.record, 3) ||
            this._getTargetEndDate(l3.record, 3);
          if (l3Start) dates.push(l3Start);
          if (l3End) dates.push(l3End);
        }
      }
    }
    return dates;
  }

  _refreshView(preserveScroll = false)  {
    const searchTerm = this.searchTerm;
    const hasActiveQuery = this._hasActiveQuery();
    let matchCount = 0;

    const buildLevel3 = (item) => {
      const isSearchMatch = this._nameIncludes(item.record.Name, searchTerm);
      if (isSearchMatch && searchTerm) matchCount += 1;
      const visible =
      this._matchesStatus(item.record, this.level3Progress) &&
      this._matchesOwner(item) &&
      this._recordMatchesAdvancedFilters(item.record);
      if (!visible) {
        return null;
      }
      return {
        ...item,
        _searchMatch: isSearchMatch,
        rowClass:
          isSearchMatch && searchTerm ? "l3-row search-highlight" : "l3-row"
      };
    };

    const buildLevel2 = (item) => {
      const children = (item.children || []).map(buildLevel3).filter(Boolean);
      const isSearchMatch = this._nameIncludes(item.record.Name, searchTerm);
      if (isSearchMatch && searchTerm) matchCount += 1;
      const directVisible =
      this._matchesStatus(item.record, this.level2Progress) &&
      this._matchesOwner(item) &&
      this._recordMatchesAdvancedFilters(item.record);
      if (!directVisible && children.length === 0) {
        return null;
      }
      const hasMatchedDescendant = children.some(
        (child) => child?._searchMatch
      );
      const expandedForView =
        item.expanded ||
        (hasActiveQuery && children.length > 0) ||
        (searchTerm && hasMatchedDescendant);
      return {
        ...item,
        expanded: expandedForView,
        children,
        _searchMatch: isSearchMatch,
        _hasMatchedDescendant: hasMatchedDescendant,
        rowClass:
          isSearchMatch && searchTerm
            ? "l2-row search-highlight"
            : expandedForView
              ? "l2-row expanded-row"
              : "l2-row"
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
      this._recordMatchesAdvancedFilters(item.record);
        if (!directVisible && children.length === 0) {
          return null;
        }
        const hasMatchedDescendant = children.some(
          (child) => child?._searchMatch || child?._hasMatchedDescendant
        );
        const expandedForView =
          item.expanded ||
          (hasActiveQuery && children.length > 0) ||
          (searchTerm && hasMatchedDescendant);
        return {
          ...item,
          expanded: expandedForView,
          children,
          _searchMatch: isSearchMatch,
          rowClass:
            isSearchMatch && searchTerm
              ? "l1-item search-highlight"
              : expandedForView
                ? "l1-item expanded-row"
                : "l1-item"
        };
      })
      .filter(Boolean);

    this.level1Data = view;
    this.matchCount = matchCount;
    this.initTimeline(preserveScroll);
if (!preserveScroll) {
  setTimeout(() => this.scrollToToday(), 50);
}
  }

  _refreshBarsForCurrentScale() {
    this.level1Data = (this.level1Data || []).map((l1) => {
      const l1PlannedStart = this._getPlannedStartDate(l1.record, 1);
      const l1PlannedEnd = this._getPlannedEndDate(l1.record, 1);
      const l1ActualStart = this._getActualStartDate(l1.record, 1);
      const l1ActualEnd = this._getActualEndDate(l1.record, 1);
      const l1TargetEnd = this._getTargetEndDate(l1.record, 1);
      const l1BarEnd = this._getBarEndDate(l1.record, 1);
      const l1Progress = Math.min(Math.max(l1.progress || 0, 0), 100);
      const l1Status = this._getStatusValue(l1.record, this.level1Progress);
      const l1FillClass = this._barFillClass(l1Status, l1Progress);
      let l1CompletedEarlyStyle = null;
      if (
        l1FillClass.includes("complete") &&
        l1ActualEnd &&
        l1TargetEnd &&
        l1ActualEnd.getTime() < l1TargetEnd.getTime()
      ) {
        l1CompletedEarlyStyle = this.calculateBarStyle(
          l1ActualEnd,
          l1TargetEnd
        );
      }
      const l1OutlineStyle = this._calculateOutlineBarStyle(
        l1PlannedStart,
        l1TargetEnd || l1PlannedEnd
      );
      return {
        ...l1,
        plannedBarStyle: l1OutlineStyle,
        barStyle: this.calculateBarStyle(
          l1ActualStart || l1PlannedStart,
          l1BarEnd
        ),
        completedEarlyStyle: l1CompletedEarlyStyle,
        targetEndStyle: this._calculateTargetMarkerStyleFromBarStyle(
          l1OutlineStyle,
          l1TargetEnd || l1PlannedEnd
        ),
        barClass: `gantt-bar-item actual-bar-item ${this._barToneClass(l1FillClass)}`,
        fillClass: l1FillClass,
        progressStyle: this._buildProgressStyle(l1Progress, l1Status) +
               this._getBarColorOverride(l1Status),
        progressLabel: this._getStatusLabel(l1Status),
        statusLabelClass: this._getStatusLabelClass(
          l1Status,
          l1ActualStart,
          l1BarEnd
        ),
        hoverText: this._buildHoverText(
          l1.record,
          1,
          l1Status,
          l1ActualStart,
          l1BarEnd,
          this.calculateDuration(l1ActualStart, l1BarEnd),
          l1Progress
        ),
        children: (l1.children || []).map((l2) => {
          const l2PlannedStart = this._getPlannedStartDate(l2.record, 2);
          const l2PlannedEnd = this._getPlannedEndDate(l2.record, 2);
          const l2ActualStart = this._getActualStartDate(l2.record, 2);
          const l2ActualEnd = this._getActualEndDate(l2.record, 2);
          const l2TargetEnd = this._getTargetEndDate(l2.record, 2);
          const l2BarEnd = this._getBarEndDate(l2.record, 2);
          const l2Progress = Math.min(Math.max(l2.progress || 0, 0), 100);
          const l2Status = this._getStatusValue(l2.record, this.level2Progress);
          const l2FillClass = this._barFillClass(l2Status, l2Progress);
          let l2CompletedEarlyStyle = null;
          if (
            l2FillClass.includes("complete") &&
            l2ActualEnd &&
            l2TargetEnd &&
            l2ActualEnd.getTime() < l2TargetEnd.getTime()
          ) {
            l2CompletedEarlyStyle = this.calculateBarStyle(
              l2ActualEnd,
              l2TargetEnd
            );
          }
          const l2OutlineStyle = this._calculateOutlineBarStyle(
            l2PlannedStart,
            l2TargetEnd || l2PlannedEnd
          );
          return {
            ...l2,
            plannedBarStyle: l2OutlineStyle,
            barStyle: this.calculateBarStyle(
              l2ActualStart || l2PlannedStart,
              l2BarEnd
            ),
            completedEarlyStyle: l2CompletedEarlyStyle,
            targetEndStyle: this._calculateTargetMarkerStyleFromBarStyle(
              l2OutlineStyle,
              l2TargetEnd || l2PlannedEnd
            ),
            barClass: `gantt-bar-item actual-bar-item ${this._barToneClass(l2FillClass)}`,
            progressStyle: this._buildProgressStyle(l2Progress, l2Status) +
               this._getBarColorOverride(l2Status),
progressLabel: this._getStatusLabel(l2Status),
            statusLabelClass: this._getStatusLabelClass(
              l2Status,
              l2ActualStart,
              l2BarEnd
            ),
            fillClass: l2FillClass,
            hoverText: this._buildHoverText(
              l2.record,
              2,
              l2Status,
              l2ActualStart,
              l2BarEnd,
              this.calculateDuration(l2ActualStart, l2BarEnd),
              l2Progress
            ),
            children: (l2.children || []).map((l3) => {
              const l3PlannedStart = this._getPlannedStartDate(l3.record, 3);
              const l3PlannedEnd = this._getPlannedEndDate(l3.record, 3);
              const l3ActualStart = this._getActualStartDate(l3.record, 3);
              const l3ActualEnd = this._getActualEndDate(l3.record, 3);
              const l3TargetEnd = this._getTargetEndDate(l3.record, 3);
              const l3BarEnd = this._getBarEndDate(l3.record, 3);
              const l3Progress = Math.min(Math.max(l3.progress || 0, 0), 100);
              const l3Status = this._getStatusValue(
                l3.record,
                this.level3Progress
              );
              const l3FillClass = this._barFillClass(l3Status, l3Progress);
              let l3CompletedEarlyStyle = null;
              if (
                l3FillClass.includes("complete") &&
                l3ActualEnd &&
                l3TargetEnd &&
                l3ActualEnd.getTime() < l3TargetEnd.getTime()
              ) {
                l3CompletedEarlyStyle = this.calculateBarStyle(
                  l3ActualEnd,
                  l3TargetEnd
                );
              }
              const l3OutlineStyle = this._calculateOutlineBarStyle(
                l3PlannedStart,
                l3TargetEnd || l3PlannedEnd
              );
              return {
                ...l3,
                plannedBarStyle: l3OutlineStyle,
                barStyle: this.calculateBarStyle(
                  l3ActualStart || l3PlannedStart,
                  l3BarEnd
                ),
                completedEarlyStyle: l3CompletedEarlyStyle,
                targetEndStyle: this._calculateTargetMarkerStyleFromBarStyle(
                  l3OutlineStyle,
                  l3TargetEnd || l3PlannedEnd
                ),
                barClass: `gantt-bar-item l3-bar actual-bar-item ${this._barToneClass(l3FillClass)}`,
                progressStyle: this._buildProgressStyle(l3Progress, l3Status) +
               this._getBarColorOverride(l3Status),
progressLabel: this._getStatusLabel(l3Status),
                statusLabelClass: this._getStatusLabelClass(
                  l3Status,
                  l3ActualStart,
                  l3BarEnd
                ),
                fillClass: l3FillClass,
                hoverText: this._buildHoverText(
                  l3.record,
                  3,
                  l3Status,
                  l3ActualStart,
                  l3BarEnd,
                  this.calculateDuration(l3ActualStart, l3BarEnd),
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
    if (!record || !statusField) return "";
    const value = record[statusField];
    return value == null ? "" : String(value);
  }

  _buildHoverText(record, level, statusValue, startDate, endDate, duration, progress) {
  return `${record?.Name || "Untitled"}\nLevel: ${level}\nStatus: ${this._getStatusLabel(statusValue) || "N/A"}\nStart: ${this._formatDate(startDate)}\nEnd: ${this._formatDate(endDate)}\nDuration: ${duration}\nProgress: ${progress}%`;
}

  _formatDate(value) {
    if (!value || Number.isNaN(value)) return "N/A";
    return value.toLocaleDateString("default", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  _getConfiguredTone(normalizedStatus) {
  if (!normalizedStatus) return '';
  // If admin configured a direct color, tone-based class is not needed
  if (this._getConfiguredColor(normalizedStatus)) return 'custom';
  return (
    this._parseStatusColorMap().find(item =>
      normalizedStatus.includes(item.status)
    )?.tone || ''
  );
}


  _parseStatusColorMap() {
  const raw = (this.statusColorMap || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map(pair => pair.trim())
    .filter(pair => pair.includes('='))
    .map(pair => {
      const eqIndex   = pair.indexOf('=');
      const status    = pair.substring(0, eqIndex).trim().toLowerCase();
      // Rejoin everything after first '=' to support rgb(x,y,z) which contains commas
      const rawColor  = pair.substring(eqIndex + 1).trim();
      const color     = this._resolveColor(rawColor);
      return { status, rawColor, color };
    })
    .filter(item => item.status && item.color);
}
_resolveColor(rawColor) {
  if (!rawColor) return '';
  const trimmed = rawColor.trim().toLowerCase();

  // 1. Named palette lookup
  if (STATUS_COLOR_PALETTE[trimmed]) {
    return STATUS_COLOR_PALETTE[trimmed];
  }

  // 2. Hex color — #rgb, #rrggbb, #rrggbbaa
  if (/^#([0-9a-f]{3,8})$/i.test(trimmed)) {
    return trimmed;
  }

  // 3. rgb() / rgba()
  if (/^rgba?\s*\([\d\s,./]+\)$/i.test(trimmed)) {
    return trimmed;
  }

  // 4. hsl() / hsla()
  if (/^hsla?\s*\([\d\s,%./]+\)$/i.test(trimmed)) {
    return trimmed;
  }

  // 5. CSS named colors (basic set)
  const cssColors = [
    'aliceblue','antiquewhite','aqua','aquamarine','azure','beige','bisque',
    'black','blanchedalmond','blueviolet','brown','burlywood','cadetblue',
    'chartreuse','chocolate','coral','cornflowerblue','cornsilk','crimson',
    'cyan','darkblue','darkcyan','darkgoldenrod','darkgray','darkgreen',
    'darkkhaki','darkmagenta','darkolivegreen','darkorange','darkorchid',
    'darkred','darksalmon','darkseagreen','darkslateblue','darkslategray',
    'darkturquoise','darkviolet','deeppink','deepskyblue','dimgray',
    'dodgerblue','firebrick','floralwhite','forestgreen','fuchsia','gainsboro',
    'gold','goldenrod','gray','greenyellow','honeydew','hotpink','indianred',
    'indigo','ivory','khaki','lavender','lavenderblush','lawngreen',
    'lemonchiffon','lightblue','lightcoral','lightcyan','lightgoldenrodyellow',
    'lightgray','lightgreen','lightpink','lightsalmon','lightseagreen',
    'lightskyblue','lightslategray','lightsteelblue','lightyellow','lime',
    'limegreen','linen','magenta','maroon','mediumaquamarine','mediumblue',
    'mediumorchid','mediumpurple','mediumseagreen','mediumslateblue',
    'mediumspringgreen','mediumturquoise','mediumvioletred','midnightblue',
    'mintcream','mistyrose','moccasin','navajowhite','oldlace','olive',
    'olivedrab','orangered','orchid','palegoldenrod','palegreen','paleturquoise',
    'palevioletred','papayawhip','peachpuff','peru','plum','powderblue',
    'rosybrown','royalblue','saddlebrown','salmon','sandybrown','seagreen',
    'seashell','sienna','silver','skyblue','slateblue','slategray','snow',
    'springgreen','steelblue','tan','thistle','tomato','turquoise','violet',
    'wheat','yellow','yellowgreen'
  ];
  if (cssColors.includes(trimmed)) {
    return trimmed;
  }

  // Unrecognized — return empty so fallback kicks in
  return '';
}
_getConfiguredColor(normalizedStatus) {
  if (!normalizedStatus) return '';
  const entry = this._parseStatusColorMap().find(item =>
    normalizedStatus.toLowerCase().includes(item.status)
  );
  return entry?.color || '';
}
  _normalizeTone(tone) {
    const normalized = String(tone || "")
      .trim()
      .toLowerCase();
    if (
      [
        "not-started",
        "not started",
        "not_started",
        "notstarted",
        "new",
        "blue"
      ].includes(normalized)
    ) {
      return "not-started";
    }
    if (
      ["progress", "in progress", "in-progress", "active"].includes(normalized)
    ) {
      return "progress";
    }
    if (["complete", "completed", "done", "green"].includes(normalized)) {
      return "complete";
    }
    if (
      [
        "risk",
        "at risk",
        "blocked",
        "pending",
        "orange",
        "amber",
        "red"
      ].includes(normalized)
    ) {
      return "risk";
    }
    return "";
  }
_getBarColorOverride(statusValue) {
  const color = this._getConfiguredColor((statusValue || '').toLowerCase());
  return color ? `background-color:${color};` : '';
}
  _matchesStatus(record, fieldName) {
    if (this.statusFilter === "all") return true;
    const value =
      record && fieldName && record[fieldName] ? String(record[fieldName]) : "";
    return value === this.statusFilter;
  }

  _matchesOwner(item) {
    return this.ownerFilter === "all" || item.ownerId === this.ownerFilter;
  }

  _hasExpandedRows(level1Items) {
    return (level1Items || []).some(
      (item) =>
        item.expanded || (item.children || []).some((child) => child.expanded)
    );
  }

  _formatObjectLabel(apiName) {
    const raw = (apiName || "Record").replace(/__c$/, "").replace(/_/g, " ");
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
    if (level === 1)
      return this.level1TargetEndDate || this._getPlannedEndField(1);
    if (level === 2)
      return this.level2TargetEndDate || this._getPlannedEndField(2);
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

  _getBarEndDate(record, level) {
    return (
      this._getActualEndDate(record, level) ||
      this._getPlannedEndDate(record, level)
    );
  }

  _getItemStartDate(item, level) {
    const fieldName = this._getActualStartField(level);
    return this.parseDate(fieldName ? item.record[fieldName] : null);
  }

  _getItemEndDate(item, level) {
    return this._getBarEndDate(item.record, level);
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
      const l1End = this._getBarEndDate(l1.record, 1);
      if (l1End) dates.push(l1End);
      for (const l2 of l1.children || []) {
        const l2End = this._getBarEndDate(l2.record, 2);
        if (l2End) dates.push(l2End);
        for (const l3 of l2.children || []) {
          const l3End = this._getBarEndDate(l3.record, 3);
          if (l3End) dates.push(l3End);
        }
      }
    }
    return dates;
  }

  _buildTooltipStyle(event) {
    if (!event) {
      return "";
    }
    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    const eventX =
      typeof event.clientX === "number" && event.clientX > 0
        ? event.clientX
        : event.currentTarget
          ? event.currentTarget.getBoundingClientRect().left + 12
          : 12;
    const eventY =
      typeof event.clientY === "number" && event.clientY > 0
        ? event.clientY
        : event.currentTarget
          ? event.currentTarget.getBoundingClientRect().top + 12
          : 12;
    const chartRect = this.template
      .querySelector(".gantt-content")
      ?.getBoundingClientRect();
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

  _renderChartToCanvas(rowsOverride) {
  const rows = rowsOverride || this._collectCanvasRows(this.level1Data);

  const sidebarWidth      = this.sidebarWidthPx;
  const chartWidth        = Math.max(
    this.timelineMonths.length * this.timelineUnitWidthPx,
    this.timelineUnitWidthPx
  );

  // ── Tighter layout constants ──────────────────────────────────────────
  const topBandHeight     = 48;   // title + date bar
  const colHeaderHeight   = 36;   // NAME / DURATION / OWNER row
  const timelineHdrHeight = 36;   // month labels row
  const rowHeightL1       = 38;
  const rowHeightChild    = 32;
  const contentHeight     = rows.reduce(
    (sum, row) => sum + (row.type === 'l1' ? rowHeightL1 : rowHeightChild), 0
  ) || 200;

  const width  = sidebarWidth + chartWidth;
  const height = topBandHeight + colHeaderHeight + timelineHdrHeight + contentHeight;

  const canvas = document.createElement('canvas');

  // ── 2× pixel ratio for crisp text ────────────────────────────────────
  const DPR    = 2;
  canvas.width  = width  * DPR;
  canvas.height = height * DPR;
  canvas.style.width  = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  // ── Background ────────────────────────────────────────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // ── Top band: title left, date right ─────────────────────────────────
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, topBandHeight);

  // Title — large and bold
  ctx.fillStyle  = '#ffffff';
  ctx.font       = '700 22px "Segoe UI", Arial, sans-serif';
  ctx.textAlign  = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(this.displayTitle || 'Gantt Chart', 20, topBandHeight / 2);

  // Date — right-aligned, clean format (no "Exported" word)
  const today     = this._getCurrentDate();
  const dateLabel = today.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  }); // e.g. "30 Apr 2026"
  ctx.fillStyle   = '#94a3b8';
  ctx.font        = '500 13px "Segoe UI", Arial, sans-serif';
  ctx.textAlign   = 'right';
  ctx.fillText(dateLabel, width - 20, topBandHeight / 2);

  // ── Column headers (NAME / DURATION / OWNER) ─────────────────────────
  const colHdrY   = topBandHeight;
  const nameX     = 20;
  const durationX = SIDEBAR_FRAME_PX + this.nameColWidth + COLUMN_GAP_PX + 6;
  const ownerX    = SIDEBAR_FRAME_PX + this.nameColWidth + this.durationColWidth + COLUMN_GAP_PX * 2 + 6;

  ctx.fillStyle   = '#f1f5f9';
  ctx.fillRect(0, colHdrY, sidebarWidth, colHeaderHeight);
  ctx.fillRect(sidebarWidth, colHdrY, chartWidth, colHeaderHeight);

  ctx.fillStyle    = '#475569';
  ctx.font         = '700 11px "Segoe UI", Arial, sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  const colHdrMid  = colHdrY + colHeaderHeight / 2;
  ctx.fillText('NAME',     nameX,     colHdrMid);
  ctx.fillText('DURATION', durationX, colHdrMid);
  ctx.fillText('OWNER',    ownerX,    colHdrMid);

  // ── Timeline month headers ────────────────────────────────────────────
  const timeHdrY  = topBandHeight + colHeaderHeight;
  ctx.fillStyle   = '#f8fafc';
  ctx.fillRect(sidebarWidth, timeHdrY, chartWidth, timelineHdrHeight);

  // Bottom border under timeline header
  ctx.strokeStyle = '#0055b3';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(sidebarWidth, timeHdrY + timelineHdrHeight);
  ctx.lineTo(width,        timeHdrY + timelineHdrHeight);
  ctx.stroke();

  this.timelineMonths.forEach((month, index) => {
    const x = sidebarWidth + index * this.timelineUnitWidthPx;

    // Vertical grid line
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(x, timeHdrY);
    ctx.lineTo(x, height);
    ctx.stroke();

    // Month label — bigger and clearer
    const isCurrent = month.cellClass.includes('is-current');
    ctx.fillStyle    = isCurrent ? '#0055b3' : '#334155';
    ctx.font         = `${isCurrent ? '700' : '600'} 12px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(month.label, x + 8, timeHdrY + timelineHdrHeight / 2);
  });

  // ── Today line ────────────────────────────────────────────────────────
  const currentDate  = this._getCurrentDate();
  const contentStartY = topBandHeight + colHeaderHeight + timelineHdrHeight;
  if (this.startDateLimit && this.endDateLimit) {
    const denominator = this.endDateLimit.getTime() - this.startDateLimit.getTime();
    const rawRatio = denominator > 0
      ? (currentDate.getTime() - this.startDateLimit.getTime()) / denominator
      : 0;
    const ratio = Math.max(0, Math.min(1, rawRatio));
    const todayX = sidebarWidth + ratio * chartWidth;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.moveTo(todayX, contentStartY);
    ctx.lineTo(todayX, height);
    ctx.stroke();

    const todayText = `TODAY ${currentDate.toLocaleDateString('en-GB')}`;
    ctx.font = '700 10px "Segoe UI", Arial, sans-serif';
    const labelWidth = ctx.measureText(todayText).width + 10;
    const labelX = Math.min(Math.max(todayX + 5, sidebarWidth + 4), width - labelWidth - 4);
    const labelY = contentStartY + 5;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(labelX, labelY, labelWidth, 18);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(todayText, labelX + 5, labelY + 9);
  }

  // ── Rows ──────────────────────────────────────────────────────────────
  let currentY = contentStartY;

  rows.forEach((row) => {
    const rowHeight = row.type === 'l1' ? rowHeightL1 : rowHeightChild;
    const midY      = currentY + rowHeight / 2;

    // Row background
    ctx.fillStyle = row.type === 'l1' ? '#f8fafc' : '#ffffff';
    ctx.fillRect(0, currentY, width, rowHeight);

    // Row separator
    ctx.strokeStyle = '#e9eef4';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0,     currentY + rowHeight);
    ctx.lineTo(width, currentY + rowHeight);
    ctx.stroke();

    // ── Sidebar text ────────────────────────────────────────────────────
    const indent = row.type === 'l1' ? 20 : row.type === 'l2' ? 34 : 48;

    // Name — larger font, bold for L1
    ctx.fillStyle    = '#1e293b';
    ctx.font         = row.type === 'l1'
      ? '700 13px "Segoe UI", Arial, sans-serif'
      : '500 12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';

    // Clip name to sidebar width
    const maxNameWidth = this.nameColWidth - indent + 10;
    let   name         = row.item.record?.Name || '';
    while (name.length > 3 && ctx.measureText(name).width > maxNameWidth) {
      name = name.slice(0, -4) + '…';
    }
    // Sidebar icons: bullets and expand arrows
    const hasChildren = (row.item.children || []).length > 0;
    const showL1Bullet = row.type === 'l1' && this.hierarchyDepth === 0;
    const showL2Bullet = row.type === 'l2';
    const iconX = indent - 16;
    const bulletX = indent - 10;

    if (hasChildren) {
      ctx.fillStyle = '#0055b3';
      ctx.beginPath();
      if (row.item.expanded) {
        ctx.moveTo(iconX - 3, midY - 4);
        ctx.lineTo(iconX + 5, midY - 4);
        ctx.lineTo(iconX + 1, midY + 3);
      } else {
        ctx.moveTo(iconX - 2, midY - 4);
        ctx.lineTo(iconX + 4, midY);
        ctx.lineTo(iconX - 2, midY + 4);
      }
      ctx.closePath();
      ctx.fill();
    }

    if (showL1Bullet || showL2Bullet) {
      ctx.fillStyle = '#0055b3';
      ctx.beginPath();
      ctx.arc(bulletX, midY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillText(name, indent, midY);

    // Duration
    ctx.fillStyle = '#64748b';
    ctx.font      = '600 11px "Segoe UI", Arial, sans-serif';
    ctx.fillText(row.item.duration || '', durationX, midY);

    // Owner
    ctx.fillText(row.item.ownerName || '', ownerX, midY);

    // ── Planned bar (outline) ────────────────────────────────────────────
    const plannedLeft  = String(row.item.plannedBarStyle || '').match(/left:([0-9.]+)%/);
    const plannedWidth = String(row.item.plannedBarStyle || '').match(/width:([0-9.]+)%/);
    if (plannedLeft && plannedWidth) {
      const pX = sidebarWidth + (parseFloat(plannedLeft[1])  / 100) * chartWidth;
      const pW = Math.max(16, (parseFloat(plannedWidth[1]) / 100) * chartWidth);
      const pH = row.type === 'l1' ? 20 : 16;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#1d70d6';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(pX, midY - pH / 2, pW, pH);
      ctx.setLineDash([]);
    }

    // ── Actual bar ───────────────────────────────────────────────────────
    const barLeft  = String(row.item.barStyle || '').match(/left:([0-9.]+)%/);
    const barWidth = String(row.item.barStyle || '').match(/width:([0-9.]+)%/);
    if (barLeft && barWidth) {
      const bX  = sidebarWidth + (parseFloat(barLeft[1])  / 100) * chartWidth;
      const bW  = Math.max(16, (parseFloat(barWidth[1]) / 100) * chartWidth);
      const bH  = row.type === 'l1' ? 20 : 16;
      const bY  = midY - bH / 2;

      // Progress fill width
      const progressPct = parseFloat(
        String(row.item.progressStyle || 'width:100').match(/([0-9.]+)/)?.[1] || '100'
      );
      const fillW = Math.max(8, bW * (progressPct / 100));

      // Color — configured > tone fallback
      const statusVal      = row.item.progressLabel || '';
      const configuredColor = this._getConfiguredColor(statusVal.toLowerCase());
      ctx.fillStyle = configuredColor || (
        row.item.fillClass.includes('complete')    ? '#15803d' :
        row.item.fillClass.includes('risk')        ? '#d84315' :
        row.item.fillClass.includes('not-started') ? '#2d5a8e' :
        row.item.fillClass.includes('pending')     ? '#f97316' : '#64748b'
      );

      // Rounded rect helper
      const radius = 3;
      ctx.beginPath();
      ctx.moveTo(bX + radius, bY);
      ctx.lineTo(bX + fillW - radius, bY);
      ctx.quadraticCurveTo(bX + fillW, bY, bX + fillW, bY + radius);
      ctx.lineTo(bX + fillW, bY + bH - radius);
      ctx.quadraticCurveTo(bX + fillW, bY + bH, bX + fillW - radius, bY + bH);
      ctx.lineTo(bX + radius, bY + bH);
      ctx.quadraticCurveTo(bX, bY + bH, bX, bY + bH - radius);
      ctx.lineTo(bX, bY + radius);
      ctx.quadraticCurveTo(bX, bY, bX + radius, bY);
      ctx.closePath();
      ctx.fill();

      // Status label inside bar
      if (statusVal && bW > 50) {
        ctx.save();
        ctx.fillStyle    = '#ffffff';
        ctx.font         = '700 11px "Segoe UI", Arial, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(statusVal, bX + bW / 2, midY);
        ctx.restore();
      }
    }

    // ── Target end diamond ───────────────────────────────────────────────
    const targetMatch = String(row.item.targetEndStyle || '').match(/left:([0-9.]+)%/);
    if (targetMatch && !String(row.item.targetEndStyle).includes('display:none')) {
      const tX = sidebarWidth + (parseFloat(targetMatch[1]) / 100) * chartWidth;
      ctx.save();
      ctx.translate(tX, midY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle   = '#e9f8f0';
      ctx.strokeStyle = '#1f8f63';
      ctx.lineWidth   = 1.5;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeRect(-5, -5, 10, 10);
      ctx.restore();
    }

    currentY += rowHeight;
  });

  if (this.startDateLimit && this.endDateLimit) {
    const denominator = this.endDateLimit.getTime() - this.startDateLimit.getTime();
    const rawRatio = denominator > 0
      ? (currentDate.getTime() - this.startDateLimit.getTime()) / denominator
      : 0;
    const ratio = Math.max(0, Math.min(1, rawRatio));
    const todayX = sidebarWidth + ratio * chartWidth;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(todayX, timeHdrY);
    ctx.lineTo(todayX, height);
    ctx.stroke();

    const todayText = `TODAY ${currentDate.toLocaleDateString('en-GB')}`;
    ctx.font = '700 10px "Segoe UI", Arial, sans-serif';
    const labelWidth = ctx.measureText(todayText).width + 10;
    const labelX = Math.min(Math.max(todayX + 5, sidebarWidth + 4), width - labelWidth - 4);
    const labelY = contentStartY + 5;
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(labelX, labelY, labelWidth, 18);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(todayText, labelX + 5, labelY + 9);
  }

  return canvas;
}
get _statusLabelMap() {
  const map = {};
  (this.statusChoices || []).forEach(opt => {
    if (opt.value) {
      map[opt.value.toLowerCase()] = opt.label;
    }
  });
  return map;
}

_getStatusLabel(statusValue) {
  if (!statusValue) return '';
  const map = this._statusLabelMap;
  // Try exact match first, then lowercase
  return map[statusValue] 
      || map[statusValue.toLowerCase()] 
      || statusValue;
}
get legendItems() {
  if (this.statusChoices && this.statusChoices.length > 0) {
    return this.statusChoices.map(item => {
      const tone = this._determineStatusTone(item.value);
      return {
        label:      item.label,
        tone:       tone,
        colorStyle: this._getSwatchColorStyle(tone, item.value)
      };
    });
  }

  const parsed = this._parseStatusColorMap();

  if (parsed.length) {
    return parsed.map(item => ({
      label:      this._getStatusLabel(item.status) || 
                  (item.status.charAt(0).toUpperCase() + item.status.slice(1)),
      tone:       item.status,
      rawColor:   item.rawColor,
      colorStyle: `background-color:${item.color};`
    }));
  }

  return [
    { label: 'Not Started', tone: 'not-started', colorStyle: `background-color:${STATUS_COLOR_PALETTE.blue};`   },
    { label: 'New',         tone: 'new',         colorStyle: `background-color:${STATUS_COLOR_PALETTE.navy};`   },
    { label: 'Pending',     tone: 'progress',    colorStyle: `background-color:${STATUS_COLOR_PALETTE.orange};` },
    { label: 'Completed',   tone: 'complete',    colorStyle: `background-color:${STATUS_COLOR_PALETTE.green};`  }
  ];
}

get hasLegend() {
  return this.legendItems.length > 0;
}

_getSwatchColorStyle(tone, statusLabel) {
  // Admin-configured color takes priority
  const configured = this._getConfiguredColor((statusLabel || '').toLowerCase());
  if (configured) return `background-color:${configured};`;

  // Tone-based fallback defaults
  const defaults = {
    'not-started': STATUS_COLOR_PALETTE.blue,
    'new':         STATUS_COLOR_PALETTE.navy,
    'progress':    STATUS_COLOR_PALETTE.orange,
    'complete':    STATUS_COLOR_PALETTE.green,
    'risk':        STATUS_COLOR_PALETTE.red,
    'pending':     STATUS_COLOR_PALETTE.orange,
    'na':          STATUS_COLOR_PALETTE.grey
  };
  return `background-color:${defaults[tone] || '#94a3b8'};`;
}
get filterPanelClass() {
  return this.isFilterPanelOpen
    ? "filter-panel filter-panel-open"
    : "filter-panel";
}

get filterButtonClass() {
  return this.activeFilterCount > 0
    ? 'filter-toggle-btn filter-toggle-btn--active'
    : 'filter-toggle-btn';
}
 
get filterBadgeLabel() {
  return this.activeFilterCount > 0 ? String(this.activeFilterCount) : "";
}
 
get hasActiveFilters() {
  return this.activeFilterCount > 0;
}
 
get filterRowsEmpty() {
  return this.filterRows.length === 0;
}
 
get filterLogicHint() {
  const active = this.filterRows.filter(
    r => r.field && r.value !== "" && r.value !== null && r.value !== undefined
  );
  if (active.length === 0) return "No filters applied";
  if (active.length === 1) return "Showing records where condition is met";
  
  // Build a readable hint from the logic configuration
  let hint = "Show records where ";
  const parts = active.map((r, idx) => {
    if (idx === 0) return "condition 1";
    const op = r.logic === "OR" ? "OR" : r.logic === "NOT" ? "NOT" : "AND";
    return `${op} condition ${idx + 1}`;
  });
  hint += parts.join(" ");
  return hint;
}

// ── Field metadata loader ─────────────────────────────────────────────────────

_loadFilterFields() {
  if (!this.level1Object) return;
  // Already loaded — skip
  if (this.availableFilterFields.length > 0) return;
 
  getObjectFields({ objectName: this.level1Object })
    .then((result) => {
      this.availableFilterFields = (result || []).map((f) => ({
        label:    f.label,
        value:    f.value,
        type:     f.type  || "string",
        options:  f.options || []
      }));
    })
    .catch(() => {
      // Graceful fallback — leave availableFilterFields empty; panel shows a message
      this.availableFilterFields = [];
    });
}
 
// ── Operator catalogue (mirrors SF list view) ─────────────────────────────────
 
_getOperatorsForType(type) {
  const text = [
    { label: "equals",            value: "eq" },
    { label: "not equal to",      value: "neq" },
    { label: "contains",          value: "contains" },
    { label: "does not contain",  value: "notcontains" },
    { label: "starts with",       value: "startswith" }
  ];
  const numeric = [
    { label: "equals",            value: "eq" },
    { label: "not equal to",      value: "neq" },
    { label: "greater than",      value: "gt" },
    { label: "greater or equal",  value: "gte" },
    { label: "less than",         value: "lt" },
    { label: "less or equal",     value: "lte" }
  ];
  const dateOps = [
    { label: "equals",            value: "eq" },
    { label: "not equal to",      value: "neq" },
    { label: "greater than",      value: "gt" },
    { label: "less than",         value: "lt" },
    { label: "last N days",       value: "lastNDays" },
    { label: "next N days",       value: "nextNDays" }
  ];
  const bool = [
    { label: "equals",            value: "eq" }
  ];
  const picklist = [
    { label: "equals",            value: "eq" },
    { label: "not equal to",      value: "neq" }
  ];
  const t = (type || "").toLowerCase();
  if (t === "date" || t === "datetime")                               return dateOps;
  if (["integer","double","currency","percent","number"].includes(t)) return numeric;
  if (t === "boolean" || t === "checkbox")                            return bool;
  if (t === "picklist" || t === "multipicklist")                      return picklist;
  return text;
}
 
// ── Type helpers ──────────────────────────────────────────────────────────────
 
_isPicklistType(type) {
  return ["picklist", "multipicklist"].includes((type || "").toLowerCase());
}
_isDateType(type) {
  return ["date", "datetime"].includes((type || "").toLowerCase());
}
_isBooleanType(type) {
  return ["boolean", "checkbox"].includes((type || "").toLowerCase());
}
_isNumericType(type) {
  return ["integer","double","currency","percent","number"].includes((type || "").toLowerCase());
}
 
// ── Logic operators ──────────────────────────────────────────────────────────
 
_getLogicOperators() {
  return [
    { label: "AND (&&)",  value: "AND" },
    { label: "OR (||)",   value: "OR" },
    { label: "NOT (!)",   value: "NOT" }
  ];
}
 
// ── Row factory ───────────────────────────────────────────────────────────────
 
_makeRow(fieldDef, isFirstRow = false) {
  // fieldDef may be undefined when availableFilterFields is still loading
  const fd       = fieldDef || this.availableFilterFields[0] || { value: "", type: "string", options: [] };
  const operators = this._getOperatorsForType(fd.type);
  const isPicklist = this._isPicklistType(fd.type);
  const isDate     = this._isDateType(fd.type);
  const isBoolean  = this._isBooleanType(fd.type);
  const id = ++this._filterRowCounter;
  // Sequential display number — recomputed fresh in _rebuildRowNumbers()
  return {
    id,
    logicKey:        `logic-${id}`,
    displayNum:      this.filterRows.length + 1,   // will be normalised
    field:           fd.value,
    fieldType:       fd.type,
    fieldOptions:    fd.options || [],
    operator:        operators[0]?.value || "eq",
    operatorOptions: operators,
    value:           "",
    logicOptions: this._getLogicOperators().map(o => ({
  ...o,
  selected: o.value === (isFirstRow ? "" : "AND")
})),
    isFirstRow,
    isPicklist,
    isDate,
    isBoolean,
    isText: !isPicklist && !isDate && !isBoolean
  };
}
 
/** Reassign sequential 1-based display numbers after any add/remove */
_rebuildRowNumbers() {
  this.filterRows = this.filterRows.map((r, i) => ({ ...r, displayNum: i + 1 }));
}
 
// ── Panel open / close ────────────────────────────────────────────────────────
 
toggleFilterPanel() {
  this.isFilterPanelOpen = !this.isFilterPanelOpen;
  if (this.isFilterPanelOpen) {
    this._loadFilterFields();
    if (this.filterRows.length === 0) {
      this._addFilterRow();
    }
  }
}
 
closeFilterPanel() {
  this.isFilterPanelOpen = false;
}
 
// ── Row management ────────────────────────────────────────────────────────────
 
handleAddFilterRow() {
  this._addFilterRow();
}
 
_addFilterRow() {
  const fd = this.availableFilterFields[0];
  const isFirstRow = this.filterRows.length === 0;
  this.filterRows = [...this.filterRows, this._makeRow(fd, isFirstRow)];
  this._rebuildRowNumbers();
}
 
handleRemoveFilterRow(event) {
  const rowId = parseInt(event.currentTarget.dataset.rowid, 10);
  this.filterRows = this.filterRows.filter((r) => r.id !== rowId);
  this._rebuildRowNumbers();
  this._applyAdvancedFilters();
}
 
// ── Field / Operator / Value changes ──────────────────────────────────────────
 
handleFilterFieldChange(event) {
  const rowId    = parseInt(event.currentTarget.dataset.rowid, 10);
  const newField = event.detail?.value || event.target?.value || "";
  const fd       = this.availableFilterFields.find((f) => f.value === newField)
                    || { value: newField, type: "string", options: [] };
  const operators  = this._getOperatorsForType(fd.type);
  const isPicklist = this._isPicklistType(fd.type);
  const isDate     = this._isDateType(fd.type);
  const isBoolean  = this._isBooleanType(fd.type);
 
  this.filterRows = this.filterRows.map((r) => {
    if (r.id !== rowId) return r;
    return {
      ...r,
      field:           fd.value,
      fieldType:       fd.type,
      fieldOptions:    fd.options || [],
      operator:        operators[0]?.value || "eq",
      operatorOptions: operators,
      value:           "",
      isPicklist,
      isDate,
      isBoolean,
      isText: !isPicklist && !isDate && !isBoolean
    };
  });
}
 
handleFilterOperatorChange(event) {
  const rowId = parseInt(event.currentTarget.dataset.rowid, 10);
  const newOp = event.detail?.value || event.target?.value || "eq";
  this.filterRows = this.filterRows.map((r) =>
    r.id === rowId ? { ...r, operator: newOp } : r
  );
}
 
handleFilterValueChange(event) {
  const rowId  = parseInt(event.currentTarget.dataset.rowid, 10);
  const newVal = event.detail?.value ?? event.target?.value ?? "";
  this.filterRows = this.filterRows.map((r) =>
    r.id === rowId ? { ...r, value: newVal } : r
  );
}

handleFilterLogicChange(event) {
  const rowId    = parseInt(event.currentTarget.dataset.rowid, 10);
  const newLogic = event.detail?.value || event.target?.value || "AND";
  // In handleFilterLogicChange, replace the existing map:
this.filterRows = this.filterRows.map((r) => {
  if (r.id !== rowId) return r;
  return {
    ...r,
    logic: newLogic,
    logicOptions: this._getLogicOperators().map(o => ({
      ...o,
      selected: o.value === newLogic
    }))
  };
});
}
 
// ── Apply / Clear ─────────────────────────────────────────────────────────────
 
applyFilters() {
  const active = this.filterRows.filter(
    r => r.field && r.value !== "" && r.value !== null && r.value !== undefined
  );
  this.activeFilterCount = active.length;
  this.isFilterPanelOpen = false;
  // Reload data so filter fields are included in SOQL
  this._reloadChartData(true);
}

clearAllFilters() {
  this.filterRows        = [];
  this.activeFilterCount = 0;
  this._filterRowCounter = 0;
  this._refreshView();   // no reload needed — just unfilter what's already loaded
}
 
// ── Core filter logic ─────────────────────────────────────────────────────────
 
_applyAdvancedFilters() {
  const active = this.filterRows.filter(
    (r) => r.field && r.value !== "" && r.value !== null && r.value !== undefined
  );
  this.activeFilterCount = active.length;
  // Ensure L2/L3 children are loaded before filtering
  this._prepareHierarchyForQuery().then(() => this._refreshView());
}
 
/**
 * Returns true when the record satisfies ALL active filter rows (AND logic).
 * Called inside _refreshView() for every item at every level.
 */
_recordMatchesAdvancedFilters(record) {
  const active = this.filterRows.filter(
    (r) => r.field && (r.value !== "" && r.value !== null && r.value !== undefined)
  );
  if (!active.length) return true;

  // Start with first row result (no logic operator on row 0)
  let result = this._evaluateFilterRow(record, active[0]);

  for (let i = 1; i < active.length; i++) {
    const row = active[i];
    const rowResult = this._evaluateFilterRow(record, row);
    const logic = (row.logic || "AND").toUpperCase();

    if (logic === "OR") {
      result = result || rowResult;
    } else if (logic === "NOT") {
      result = result && !rowResult;
    } else {
      // AND (default)
      result = result && rowResult;
    }
  }

  return result;
}
 
_evaluateFilterRow(record, row) {
  if (!record) return false;
  
  // Case-insensitive field lookup — handles API name mismatches
  let raw = record[row.field];
  if (raw === undefined) {
    const keyLower = (row.field || "").toLowerCase();
    const matchedKey = Object.keys(record).find(
      k => k.toLowerCase() === keyLower
    );
    if (matchedKey) raw = record[matchedKey];
  }
  
  // If still undefined, this field isn't on the record at all
  if (raw === undefined || raw === null) return false;

  const operator = row.operator;
  // ... rest of your existing logic unchanged
 
  // ── Boolean ──────────────────────────────────────────────────────────────
  if (row.isBoolean || row.fieldType === "boolean" || row.fieldType === "checkbox") {
    const boolVal = row.value === "true" || row.value === true;
    const recBool = raw === true || raw === "true";
    return operator === "neq" ? recBool !== boolVal : recBool === boolVal;
  }
 
  // ── Date / DateTime ───────────────────────────────────────────────────────
  if (row.isDate || this._isDateType(row.fieldType)) {
    const recDate = this.parseDate(raw);
    if (!recDate) return false;
 
    if (operator === "lastNDays" || operator === "nextNDays") {
      const n = parseInt(row.value, 10);
      if (Number.isNaN(n)) return false;
      const today = this._getCurrentDate();
      const pivot = new Date(today);
      pivot.setDate(pivot.getDate() + (operator === "nextNDays" ? n : -n));
      return operator === "lastNDays"
        ? recDate >= pivot && recDate <= today
        : recDate >= today && recDate <= pivot;
    }
 
    const filterDate = this.parseDate(row.value);
    if (!filterDate) return false;
    const rd = recDate.getTime();
    const fd = filterDate.getTime();
    if (operator === "eq")  return rd === fd;
    if (operator === "neq") return rd !== fd;
    if (operator === "gt")  return rd > fd;
    if (operator === "gte") return rd >= fd;
    if (operator === "lt")  return rd < fd;
    if (operator === "lte") return rd <= fd;
    return false;
  }
 
  // ── Numeric ───────────────────────────────────────────────────────────────
  if (this._isNumericType(row.fieldType)) {
    const recNum = parseFloat(raw);
    const filNum = parseFloat(row.value);
    if (Number.isNaN(recNum) || Number.isNaN(filNum)) return false;
    if (operator === "eq")  return recNum === filNum;
    if (operator === "neq") return recNum !== filNum;
    if (operator === "gt")  return recNum > filNum;
    if (operator === "gte") return recNum >= filNum;
    if (operator === "lt")  return recNum < filNum;
    if (operator === "lte") return recNum <= filNum;
    return false;
  }
 
  // ── Picklist / Multipicklist ───────────────────────────────────────────────
  if (row.isPicklist || this._isPicklistType(row.fieldType)) {
    const recStr = String(raw ?? "");
    const filStr = String(row.value ?? "");
    if (row.fieldType === "multipicklist") {
      const recVals = recStr.split(";").map((v) => v.trim().toLowerCase());
      return operator === "neq"
        ? !recVals.includes(filStr.toLowerCase())
        : recVals.includes(filStr.toLowerCase());
    }
    return operator === "neq"
      ? recStr.toLowerCase() !== filStr.toLowerCase()
      : recStr.toLowerCase() === filStr.toLowerCase();
  }
 
  // ── Text (default) ────────────────────────────────────────────────────────
  const recStr = String(raw ?? "").toLowerCase();
  const filStr = String(row.value ?? "").toLowerCase();
  if (operator === "eq")          return recStr === filStr;
  if (operator === "neq")         return recStr !== filStr;
  if (operator === "contains")    return recStr.includes(filStr);
  if (operator === "notcontains") return !recStr.includes(filStr);
  if (operator === "startswith")  return recStr.startsWith(filStr);
  return true;
}
_getActiveFilterFieldNames() {
  return this.filterRows
    .filter(r => r.field)
    .map(r => r.field)
    .filter(Boolean);
}
}
