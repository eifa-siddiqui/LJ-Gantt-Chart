import { LightningElement, api, track } from "lwc";
import getGanttData from "@salesforce/apex/DynamicGanttController.getGanttData";
import getAvailableUsers from "@salesforce/apex/DynamicGanttController.getAvailableUsers";
import getStatusOptions from "@salesforce/apex/DynamicGanttController.getStatusOptions";
import getOrgToday from "@salesforce/apex/DynamicGanttController.getOrgToday";
import updateRecordFields from "@salesforce/apex/DynamicGanttController.updateRecordFields";

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

  startDateLimit;
  endDateLimit;
  orgToday;
  @track searchTerm = "";
  todayLineStyle = "";
  timelineScale = "months";
  isFullscreen = false;
  statusFilter = "all";
  ownerFilter = "all";
  isCurrentRecordScope = false;
  @track sourceLevel1Data = [];
  @track changeHistory = [];
  @track isSavingChange = false;
  @track dragConfirm = { visible: false };
  @track dragTooltip = { visible: false, label: "", dateStr: "", style: "" };
  suppressBarClick = false;
  dragState = null;
  sidebarResizeState = null;
  isEditMode = false;
  inlineEditBaseline = null;
  inlineEditPendingValues = null;
  durationColWidth = DEFAULT_DURATION_COL_WIDTH;
  ownerColWidth = DEFAULT_OWNER_COL_WIDTH;
  sidebarWidthValue = DEFAULT_SIDEBAR_WIDTH;

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

  get supportsLevel2() {
    return (
      this.hierarchyDepth >= 2 &&
      !!this.level2Object &&
      !!this.level2ParentLookup
    );
  }

  get supportsLevel3() {
    return (
      this.hierarchyDepth >= 3 &&
      !!this.level3Object &&
      !!this.level3ParentLookup
    );
  }

  get disableHierarchyActions() {
    return !this.supportsLevel2 || !this.hasData;
  }

  get wrapperClass() {
    const fullscreenClass = this.isFullscreen ? " is-fullscreen" : "";
    return `gantt-wrapper scale-${this.timelineScale}${fullscreenClass}`;
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
      this.errorMessage =
        "Level 1 Object is not configured. Please set it in component properties.";
      return;
    }

    this.isLoading = true;
    this.errorMessage = "";

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
      .join(",");

    getGanttData({
  objectName: this.level1Object,
  fields,
  lookupField: "",
  parentId: "",
  statusField: this.level1Progress || "",
  startDateField: this.level1StartDate || "",
  searchTerm: "",
  specificRecordId: this.isCurrentRecordScope ? this.recordId : ""
})
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

    if (
      this.supportsLevel2 &&
      this.sourceLevel1Data.length &&
      this._validateL2Config()
    ) {
      this.expandAll();
      setTimeout(() => this.scrollToToday(), 0);
    } else {
      this.initTimeline();
      this.isLoading = false;
      setTimeout(() => this.scrollToToday(), 0);
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
      this.level2Section1Fields,
      this.level2Section2Fields,
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
      .join(",");

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
      this.level3Progress
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
      rowClass: "l1-item",
      children: [],
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
      progressStyle: this._buildProgressStyle(progress, statusValue),
      progressLabel: statusValue || "",
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
      ownerName: item.record?.Owner?.Name || "",
      ownerInitials: this._getOwnerInitials(item.record?.Owner?.Name || ""),
      ownerColor: this._getOwnerColor(item.record?.OwnerId || ""),
      ownerAvatarStyle: `background-color: ${this._getOwnerColor(item.record?.OwnerId || "")}; color: #ffffff;`,
      ownerId: item.record?.OwnerId || ""
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
      barClass: `${level === 2 ? "gantt-bar-item actual-bar-item" : "gantt-bar-item l3-bar actual-bar-item"} ${this._barToneClass(fillClass)}`,
      progressStyle: this._buildProgressStyle(progress, statusValue),
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

  _barFillClass(statusValue, progress) {
    const normalizedStatus = (statusValue || "").toLowerCase();
    const customTone = this._getConfiguredTone(normalizedStatus);
    if (customTone) {
      return `gantt-bar-fill status-${customTone}`;
    }
    if (!normalizedStatus) {
      return "gantt-bar-fill status-na";
    }
    if (
      normalizedStatus.includes("complete") ||
      normalizedStatus.includes("completed") ||
      normalizedStatus.includes("done") ||
      normalizedStatus.includes("closed") ||
      normalizedStatus.includes("finished") ||
      normalizedStatus.includes("resolved") ||
      normalizedStatus.includes("approved")
    ) {
      return "gantt-bar-fill status-complete";
    }
    if (normalizedStatus.includes("pending")) {
      return "gantt-bar-fill status-pending";
    }
    if (normalizedStatus.includes("new")) {
      return "gantt-bar-fill status-not-started";
    }
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
    ) {
      return "gantt-bar-fill status-pending";
    }
    if (
      normalizedStatus.includes("not") ||
      normalizedStatus.includes("plan") ||
      normalizedStatus.includes("open") ||
      normalizedStatus.includes("todo") ||
      normalizedStatus.includes("draft") ||
      normalizedStatus.includes("queued")
    ) {
      return "gantt-bar-fill status-not-started";
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
          drag.originalDates.targetEnd ||
            drag.originalDates.actualEnd ||
            drag.originalDates.plannedEnd
        ),
        after: this._formatDate(
          shiftedDates.targetEnd ||
            shiftedDates.actualEnd ||
            shiftedDates.plannedEnd
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
  this._refreshView();
}

handleSearchClear(event) {
  event.stopPropagation();
  event.preventDefault();
  this.searchTerm = "";
  const searchInput = this.template.querySelector(".filter-search");
  if (searchInput) {
    searchInput.value = "";
  }
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
          this._getStatusValue(item.record, this._getStatusField(level)) ||
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
      rowClass: "l1-item",
      children: (item.children || []).map((child) => ({
        ...child,
        expanded: false,
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
          rowClass: "l1-item expanded-row"
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

  async exportChartAsJPG() {
    try {
      const canvas = this._renderChartToCanvas();
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.download = `${(this.displayTitle || "gantt-chart").replace(/[^a-z0-9-_]+/gi, "_")}.jpg`;
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
      // Always shift the actual end date (creates it if not present)
      return {
        plannedStart,
        plannedEnd,
        actualStart,
        actualEnd: nextBaseEnd,
        targetEnd
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
      const nextProgressStyle = this._buildProgressStyle(prog, statusVal);
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

  _reloadChartData(preserveScroll = false){
    // Reload the chart data from Salesforce to ensure bars reflect updated dates
    if (!this.level1Object) {
      return;
    }

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
      .join(",");

    getGanttData({
      objectName: this.level1Object,
      fields,
      lookupField: "",
      parentId: "",
      statusField: this.level1Progress || "",
      startDateField: this.level1StartDate || "",
      searchTerm: this.searchTerm || "",
      specificRecordId: this.isCurrentRecordScope ? this.recordId : ""
    })
      .then((result) => {
        // Update sourceLevel1Data with fresh records
        this.sourceLevel1Data = (result || []).map((item) =>
          this._wrapL1(item)
        );

        // If level 2 was previously expanded, reload it
        if (this.supportsLevel2) {
          const l2Loads = this.sourceLevel1Data
            .filter(
              (item) =>
                item._l2Loaded ||
                (item.expanded && item.children && item.children.length > 0)
            )
            .map((item, idx) => {
              return this._loadLevel2(item.record.Id).then((children) => {
                const updated = [...this.sourceLevel1Data];
                updated[idx] = {
                  ...updated[idx],
                  _l2Loaded: true,
                  children
                };
                this.sourceLevel1Data = updated;
              });
            });

          if (l2Loads.length > 0) {
            return Promise.all(l2Loads);
          }
        }
      })
      .then(() => {
  this._refreshView(preserveScroll);
})
      .catch((error) => {
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
      key: "owner", label: "Owner",
      value: item.ownerName || record.Owner?.Name || "N/A",
      isOwner: true,
      ownerInitials: item.ownerInitials,
      ownerColor: `background-color: ${item.ownerColor}; color: #ffffff;`
    },
    {
      key: "status", label: "Status",
      value: statusValue || "N/A",
      valueStyle: this._getStatusColor(statusValue)
    },
    { key: "start",    label: "Start",    value: this._formatDate(this._getItemStartDate(item, level)) },
    { key: "end",      label: "End",      value: this._formatDate(this._getItemEndDate(item, level)) },
    { key: "duration", label: "Duration", value: item.duration || "N/A" }
  ];

  return {
    summary,
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
        this._matchesOwner(item);
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
        this._matchesOwner(item);
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
          this._matchesOwner(item);
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
        progressStyle: this._buildProgressStyle(l1Progress, l1Status),
        progressLabel: l1Status || "",
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
            progressStyle: this._buildProgressStyle(l2Progress, l2Status),
            progressLabel: l2Status || "",
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
                progressStyle: this._buildProgressStyle(l3Progress, l3Status),
                progressLabel: l3Status || "",
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

  _buildHoverText(
    record,
    level,
    statusValue,
    startDate,
    endDate,
    duration,
    progress
  ) {
    return `${record?.Name || "Untitled"}\nLevel: ${level}\nStatus: ${statusValue || "N/A"}\nStart: ${this._formatDate(startDate)}\nEnd: ${this._formatDate(endDate)}\nDuration: ${duration}\nProgress: ${progress}%`;
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
    if (!normalizedStatus) return "";
    return (
      this._parseStatusColorMap().find((item) =>
        normalizedStatus.includes(item.status)
      )?.tone || ""
    );
  }

  _parseStatusColorMap() {
    const raw = (this.statusColorMap || "").trim();
    if (!raw) return [];
    return raw
      .split(",")
      .map((pair) => pair.trim())
      .filter((pair) => pair.includes("="))
      .map((pair) => {
        const [status, tone] = pair
          .split("=")
          .map((value) => (value || "").trim().toLowerCase());
        return { status, tone: this._normalizeTone(tone) };
      })
      .filter((item) => item.status && item.tone);
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

  _renderChartToCanvas() {
    const rows = [];
    for (const l1 of this.level1Data || []) {
      rows.push({ type: "l1", item: l1 });
      if (l1.expanded) {
        for (const l2 of l1.children || []) {
          rows.push({ type: "l2", item: l2 });
          if (l2.expanded) {
            for (const l3 of l2.children || []) {
              rows.push({ type: "l3", item: l3 });
            }
          }
        }
      }
    }

    const sidebarWidth = this.sidebarWidthPx;
    const chartWidth = Math.max(
      this.timelineMonths.length * this.timelineUnitWidthPx,
      this.timelineUnitWidthPx
    );
    const exportTopBandHeight = 56;
    const headerHeight = 44;
    const filterHeight = 44;
    const rowHeightL1 = 36;
    const rowHeightChild = 32;
    const contentHeight =
      rows.reduce(
        (sum, row) => sum + (row.type === "l1" ? rowHeightL1 : rowHeightChild),
        0
      ) || 220;
    const width = sidebarWidth + chartWidth;
    const height =
      exportTopBandHeight +
      headerHeight +
      filterHeight +
      headerHeight +
      contentHeight;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const exportDateLabel = `Exported ${this._formatDate(this._getCurrentDate())}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, exportTopBandHeight);
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 20px Segoe UI";
    ctx.textAlign = "left";
    ctx.fillText(this.displayTitle || "Gantt Chart", 18, 31);
    ctx.fillStyle = "#475569";
    ctx.font = "600 11px Segoe UI";
    ctx.textAlign = "right";
    ctx.fillText(exportDateLabel, width - 18, 28);
    ctx.textAlign = "left";

    ctx.fillStyle = "#f7f7f7";
    ctx.fillRect(
      0,
      exportTopBandHeight + headerHeight + filterHeight,
      width,
      headerHeight
    );
    ctx.strokeStyle = "#0055b3";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(
      0,
      exportTopBandHeight + headerHeight + filterHeight + headerHeight
    );
    ctx.lineTo(
      width,
      exportTopBandHeight + headerHeight + filterHeight + headerHeight
    );
    ctx.stroke();

    const nameX = 18;
    const durationX = SIDEBAR_FRAME_PX + this.nameColWidth + COLUMN_GAP_PX + 6;
    const ownerX =
      SIDEBAR_FRAME_PX +
      this.nameColWidth +
      this.durationColWidth +
      COLUMN_GAP_PX * 2 +
      6;
    ctx.font = "700 11px Segoe UI";
    ctx.fillStyle = "#475569";
    ctx.fillText(
      "NAME",
      nameX,
      exportTopBandHeight + headerHeight + filterHeight + 26
    );
    ctx.fillText(
      "DURATION",
      durationX,
      exportTopBandHeight + headerHeight + filterHeight + 26
    );
    ctx.fillText(
      "OWNER",
      ownerX,
      exportTopBandHeight + headerHeight + filterHeight + 26
    );

    this.timelineMonths.forEach((month, index) => {
      const x = sidebarWidth + index * this.timelineUnitWidthPx;
      ctx.strokeStyle = "#e8edf3";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, exportTopBandHeight + headerHeight + filterHeight);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillStyle = month.cellClass.includes("is-current")
        ? "#0055b3"
        : "#64748b";
      ctx.font = "700 11px Segoe UI";
      ctx.fillText(
        month.label,
        x + 8,
        exportTopBandHeight + headerHeight + filterHeight + 26
      );
    });

    const currentDate = this._getCurrentDate();
    const todayRatio =
      this.startDateLimit && this.endDateLimit
        ? (currentDate.getTime() - this.startDateLimit.getTime()) /
          (this.endDateLimit.getTime() - this.startDateLimit.getTime())
        : 0;
    const todayX = sidebarWidth + Math.max(0, todayRatio) * chartWidth;
    ctx.strokeStyle = "#e53935";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(
      todayX,
      exportTopBandHeight + headerHeight + filterHeight + headerHeight
    );
    ctx.lineTo(todayX, height);
    ctx.stroke();

    const targetLineStyle = this.projectEndLineStyle;
    if (!targetLineStyle.includes("display:none")) {
      const match = targetLineStyle.match(/left:([0-9.]+)%/);
      if (match) {
        const targetX =
          sidebarWidth + (parseFloat(match[1]) / 100) * chartWidth;
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = "#2e7d32";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(
          targetX,
          exportTopBandHeight + headerHeight + filterHeight + headerHeight
        );
        ctx.lineTo(targetX, height);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    let currentY =
      exportTopBandHeight + headerHeight + filterHeight + headerHeight;
    rows.forEach((row) => {
      const rowHeight = row.type === "l1" ? rowHeightL1 : rowHeightChild;
      ctx.fillStyle = row.type === "l1" ? "#fafbfc" : "#ffffff";
      ctx.fillRect(0, currentY, width, rowHeight);
      ctx.strokeStyle = "#edf2f7";
      ctx.beginPath();
      ctx.moveTo(0, currentY + rowHeight);
      ctx.lineTo(width, currentY + rowHeight);
      ctx.stroke();

      ctx.fillStyle = "#334155";
      ctx.font = row.type === "l1" ? "700 12px Segoe UI" : "500 12px Segoe UI";
      const textX = row.type === "l1" ? 28 : row.type === "l2" ? 44 : 58;
      ctx.fillText(row.item.record?.Name || "", textX, currentY + 22);
      ctx.fillStyle = "#64748b";
      ctx.font = "700 11px Segoe UI";
      ctx.fillText(row.item.duration || "", durationX, currentY + 22);
      ctx.fillText(row.item.ownerName || "", ownerX, currentY + 22);

      // Draw planned bar (dotted outline) if it exists and differs from actual bar
      const plannedLeftMatch = String(row.item.plannedBarStyle || "").match(
        /left:([0-9.]+)%/
      );
      const plannedWidthMatch = String(row.item.plannedBarStyle || "").match(
        /width:([0-9.]+)%/
      );
      if (plannedLeftMatch && plannedWidthMatch) {
        const pBarX =
          sidebarWidth + (parseFloat(plannedLeftMatch[1]) / 100) * chartWidth;
        const pBarWidth = Math.max(
          18,
          (parseFloat(plannedWidthMatch[1]) / 100) * chartWidth
        );
        const borderHeight = row.type === "l1" ? 18 : 16;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "#1d70d6";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          pBarX,
          currentY + (rowHeight - borderHeight) / 2,
          pBarWidth,
          borderHeight
        );
        ctx.setLineDash([]);
      }

      const leftMatch = String(row.item.barStyle || "").match(
        /left:([0-9.]+)%/
      );
      const widthMatch = String(row.item.barStyle || "").match(
        /width:([0-9.]+)%/
      );
      if (leftMatch && widthMatch) {
        const barX =
          sidebarWidth + (parseFloat(leftMatch[1]) / 100) * chartWidth;
        const barWidth = Math.max(
          18,
          (parseFloat(widthMatch[1]) / 100) * chartWidth
        );
        const barY = currentY + (rowHeight - (row.type === "l1" ? 18 : 16)) / 2;
        const borderHeight = row.type === "l1" ? 18 : 20;

        if (row.type !== "l1") {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = "#1976d2";
          ctx.strokeRect(
            barX,
            currentY + (rowHeight - borderHeight) / 2,
            barWidth,
            borderHeight
          );
          ctx.setLineDash([]);
        }

        ctx.fillStyle = row.item.fillClass.includes("complete")
          ? "#43a047"
          : row.item.fillClass.includes("risk")
            ? "#d84315"
            : row.item.fillClass.includes("not-started")
              ? "#2d5a8e"
              : row.item.fillClass.includes("pending")
                ? "#1e88e5"
                : "#0b5f1b";
        const innerWidth = Math.max(
          10,
          barWidth *
            (parseFloat(
              (row.item.progressStyle || "width:100").match(/([0-9.]+)/)?.[1] ||
                "100"
            ) /
              100)
        );
        const innerHeight = row.type === "l1" ? 18 : 16;
        ctx.fillRect(barX, barY, innerWidth, innerHeight);

        const statusLabel = String(row.item.progressLabel || "").trim();
        if (statusLabel && barWidth > 46) {
          ctx.save();
          ctx.fillStyle = "#ffffff";
          ctx.font = "700 10px Segoe UI";
          ctx.textAlign = "center";
          ctx.fillText(
            statusLabel,
            barX + barWidth / 2,
            barY + innerHeight / 2 + 4
          );
          ctx.restore();
        }
      }

      const earlyLeftMatch = String(row.item.completedEarlyStyle || "").match(
        /left:([0-9.]+)%/
      );
      const earlyWidthMatch = String(row.item.completedEarlyStyle || "").match(
        /width:([0-9.]+)%/
      );
      if (earlyLeftMatch && earlyWidthMatch) {
        const eX =
          sidebarWidth + (parseFloat(earlyLeftMatch[1]) / 100) * chartWidth;
        const eW = (parseFloat(earlyWidthMatch[1]) / 100) * chartWidth;
        ctx.beginPath();
        ctx.moveTo(eX, currentY + rowHeight / 2);
        ctx.lineTo(eX + eW, currentY + rowHeight / 2);
        ctx.strokeStyle = "#43a047";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const targetMatch = String(row.item.targetEndStyle || "").match(
        /left:([0-9.]+)%/
      );
      if (targetMatch) {
        const targetX =
          sidebarWidth + (parseFloat(targetMatch[1]) / 100) * chartWidth;
        const targetY = currentY + rowHeight / 2;
        ctx.save();
        ctx.translate(targetX, targetY);
        ctx.rotate((45 * Math.PI) / 180);
        ctx.fillStyle = "#e9f8f0";
        ctx.strokeStyle = "#1f8f63";
        ctx.lineWidth = 2;
        ctx.fillRect(-6, -6, 12, 12);
        ctx.strokeRect(-6, -6, 12, 12);
        ctx.restore();
      }

      currentY += rowHeight;
    });

    return canvas;
  }
get legendItems() {
  const parsed = this._parseStatusColorMap();
  
  // Start with configured custom mappings
  const items = parsed.map((item) => ({
    label: item.status.charAt(0).toUpperCase() + item.status.slice(1),
    tone: item.tone,
    colorStyle: this._getSwatchColorStyle(item.tone)
  }));

  // If no custom map is set, fall back to the 4 default tones
  if (!items.length) {
      return [
        {label: "Not Started", tone: "not-started", colorStyle: "background-color:#dce1e7;" },
        { label: "New",       tone: "new", colorStyle: "background-color:#2d5a8e;" },
        { label: "Pending",   tone: "progress",        colorStyle: "background-color:#c75c00;" },
        { label: "Completed", tone: "complete",    colorStyle: "background-color:#1a6b2a;" }
      ];
    }

  return items;
}

get hasLegend() {
  return this.legendItems.length > 0;
}

_getSwatchColorStyle(tone) {
  if (tone === "not-started") return "background-color:#dce1e7;";
  if (tone === "new") return "background-color:#2d5a8e;";
  if (tone === "progress")    return "background-color:#c75c00;";
  if (tone === "complete")    return "background-color:#1a6b2a;";
  if (tone === "risk")        return "background-color:#d84315;";
  return "background-color:#94a3b8;";
}
}
