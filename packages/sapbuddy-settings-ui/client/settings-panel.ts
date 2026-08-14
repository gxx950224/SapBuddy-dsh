/**
 * 设置面板 fork —— 仅遮蔽（shadow）官方面板以扩展节图标
 *
 * 官方 dsh-client-ui-settings-general 的 SettingsRoot 注册在 sidebar.settings
 * （priority 0），其 navIcon(id) 写死：models/agent-presets/plugins 有专属图标，
 * 其余节一律回退齿轮。本模块以 priority:-1 注册同槽（低者渲染），渲染全部内容
 * 但 navIcon 扩展了 sapbuddy 两个节的官方图标。
 *
 * 关键：不声明 children（官方声明仍在），不重新注册 trigger/header/close/
 * settings.section（全部存活）——因此这是可逆的纯遮蔽，移除本行即恢复官方面板。
 */
const React = require("react")
const { useState, useEffect, useCallback, useRef } = React
const primitives = require("@deepseek-ai/dsh-client-ui-primitives")
const slotsPkg = require("@deepseek-ai/dsh-client-ui-slots")

// 复用官方面板注入的样式类（settings-general bundle 会注入同名 CSS）
const C = {
  options: "VOzbGW_options", navList: "VOzbGW_navList", panel: "VOzbGW_panel",
  actions: "VOzbGW_actions", navCell: "VOzbGW_navCell", triggerLabel: "VOzbGW_triggerLabel",
  active: "VOzbGW_active", navLabel: "VOzbGW_navLabel", navIcon: "VOzbGW_navIcon",
  trigger: "VOzbGW_trigger", content: "VOzbGW_content", close: "VOzbGW_close",
  rail: "VOzbGW_rail", nav: "VOzbGW_nav", overlay: "VOzbGW_overlay",
  navTitle: "VOzbGW_navTitle", header: "VOzbGW_header", hiddenLabel: "VOzbGW_hiddenLabel", mask: "VOzbGW_mask",
}

/** 节导航图标：sapbuddy 两节用官方图标，其余与官方一致（models/agent-presets/plugins 专属，未知回退齿轮） */
function navIcon(id) {
  const icon = (Comp, size) => React.createElement(Comp, { className: C.navIcon, size })
  switch (id) {
    case "sapbuddy-connections": return icon(primitives.IconLinkOutline16, 16)
    case "sapbuddy-mcp": return icon(primitives.IconApiOutline14, 16)
    case "models": return icon(primitives.IconDataOutline16, 16)
    case "agent-presets": return icon(primitives.IconAgentPresetOutline16, 16)
    case "plugins": return icon(primitives.IconPersonalizationOutline16, 16)
    default: return icon(primitives.IconSettingsOutline16, 16)
  }
}

function SettingsPanelFork({ rows, renderSlot, activeId, onSelect, onClose }) {
  const active = rows.find((r) => r.id === activeId)?.id ?? rows[0]?.id
  const titleId = React.useId()
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose])
  const closeButton = useRef(null)
  useEffect(() => { closeButton.current?.focus() }, [])

  return React.createElement("div", { className: C.overlay, role: "presentation" }, [
    React.createElement("div", { key: "mask", className: C.mask, "aria-hidden": "true", onClick: onClose }),
    React.createElement("div", { key: "panel", className: C.panel, role: "dialog", "aria-modal": "true", "aria-labelledby": titleId }, [
      React.createElement("nav", { key: "nav", className: C.nav }, [
        React.createElement("div", { key: "t", className: C.navTitle, id: titleId }, renderSlot("settings.header", {})),
        React.createElement("div", { key: "l", className: C.navList },
          rows.map((row) =>
            React.createElement("button", {
              key: row.id, type: "button", className: C.navCell + (row.id === active ? " " + C.active : ""),
              "aria-current": row.id === active ? "true" : undefined,
              onClick: () => onSelect(row.id),
            }, [navIcon(row.id), React.createElement("span", { key: "lab", className: C.navLabel }, row.label)]),
          )),
      ]),
      React.createElement("div", { key: "content", className: C.content }, [
        React.createElement("div", { key: "h", className: C.header }, [
          React.createElement("div", { key: "a", className: C.actions }, renderSlot("settings.action", {})),
          React.createElement("button", {
            key: "c", ref: closeButton, type: "button", className: C.close, "aria-label": "关闭",
            onClick: onClose,
          }, [primitives.IconCloseOutline16 ? React.createElement(primitives.IconCloseOutline16, { key: "x", size: 14 }) : null,
            React.createElement("span", { key: "hl", className: C.hiddenLabel }, renderSlot("settings.close", {}))]),
        ]),
        React.createElement("div", { key: "o", className: C.options },
          active !== undefined && renderSlot("settings.section", { close: onClose }, { only: active })),
      ]),
    ]),
  ])
}

function SettingsRootFork(props) {
  const { wide, useSections, useOnboardingSteps, useSessions, renderSlot } = props
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState(undefined)
  const [completedOnboarding, setCompletedOnboarding] = useState(() => new Set())
  const close = useCallback(() => { setOpen(false); setActiveId(undefined) }, [])
  const openSection = useCallback((id) => { setActiveId(id); setOpen(true) }, [])
  const rows = useSections((s) => s)
  const onboardingSteps = useOnboardingSteps((s) => s)
  const onboardingActive = useSessions((state) => state.phase === "ready" && (state.current === undefined || state.byId[state.current]?.blank === true))
  const onboardingStep = onboardingActive ? onboardingSteps.find((step) => !completedOnboarding.has(step.id)) : undefined
  useEffect(() => {
    if (onboardingActive) return
    setCompletedOnboarding(new Set())
  }, [onboardingActive])
  const completeOnboardingStep = useCallback((id) => {
    setCompletedOnboarding((previous) => {
      if (previous.has(id)) return previous
      return new Set([...previous, id])
    })
  }, [])

  return React.createElement(React.Fragment, null, [
    React.createElement("button", {
      key: "tr", type: "button", className: C.trigger + (wide ? "" : " " + C.rail),
      onClick: () => setOpen(true),
    }, [
      primitives.IconSettingsOutline16 ? React.createElement(wide ? primitives.IconSettingsOutline16 : primitives.IconSettingsOutline14, { key: "i", size: wide ? 16 : 18 }) : null,
      wide && React.createElement("span", { key: "lab", className: C.triggerLabel }, "设置"),
    ]),
    open && React.createElement(SettingsPanelFork, {
      key: "p", rows, renderSlot, activeId, onSelect: setActiveId, onClose: close,
    }),
    onboardingStep !== undefined && renderSlot("settings.onboarding", {
      step: onboardingStep, onComplete: () => completeOnboardingStep(onboardingStep.id), onClose: close,
    }),
  ])
}

/**
 * 注册遮蔽面板（priority:-1 遮蔽官方 SettingsRoot，低者渲染）。
 * 返回 disposer 数组。
 */
export function installSettingsPanel(ctx) {
  let rowsVersion = -1
  let rowsRevision = -1
  let rows = []
  let onboardingVersion = -1
  let onboardingSteps = []

  const shellInjected = () => ({ hooks: {
    sections: {
      getSnapshot: () => {
        const version = ctx.slots.getVersion("settings.section")
        const revision = ctx.locale.getSnapshot().revision
        if (version !== rowsVersion || revision !== rowsRevision) {
          rowsVersion = version
          rowsRevision = revision
          rows = ctx.slots.entries("settings.section").map((e) => ({
            id: e.options.id ?? "",
            order: e.options.order ?? 0,
            label: slotsPkg.resolveSlotLabel(e.options.label) ?? "",
          })).sort((a, b) => a.order - b.order)
        }
        return rows
      },
      subscribe: (listener) => {
        const offLedger = ctx.slots.subscribe("settings.section", listener)
        const offLocale = ctx.locale.subscribe(listener)
        return () => { offLedger(); offLocale() }
      },
    },
    onboardingSteps: {
      getSnapshot: () => {
        const version = ctx.slots.getVersion("settings.onboarding")
        if (version !== onboardingVersion) {
          onboardingVersion = version
          onboardingSteps = ctx.slots.entries("settings.onboarding").map((e) => ({
            id: e.options.id ?? "",
            order: e.options.order ?? 0,
          })).sort((a, b) => a.order - b.order)
        }
        return onboardingSteps
      },
      subscribe: (listener) => ctx.slots.subscribe("settings.onboarding", listener),
    },
  } })

  const disposers = []
  disposers.push(ctx.slots.inject("sidebar.settings", () => ctx.slots.register({
    name: "sidebar.settings",
    priority: -1, // 低者渲染：遮蔽官方 SettingsRoot；不声明 children（官方声明仍在）
    inject: shellInjected,
  }, SettingsRootFork)))
  return disposers
}
