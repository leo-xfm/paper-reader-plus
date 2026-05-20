import { nextTick, onBeforeUnmount, ref } from "vue";

export function useDropdownPopover(menuSelector: string, options: { matchTriggerWidth?: boolean; offset?: number } = {}) {
  const open = ref(false);
  const rootRef = ref<HTMLElement | null>(null);
  const triggerRef = ref<HTMLElement | null>(null);
  const menuStyle = ref<Record<string, string>>({});
  const offset = options.offset ?? 9;

  function closeMenu() {
    open.value = false;
    document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    window.removeEventListener("resize", closeMenu);
    window.removeEventListener("scroll", handleWindowScroll, true);
    window.removeEventListener("keydown", handleWindowKeydown);
  }

  function updateMenuPosition() {
    const rect = triggerRef.value?.getBoundingClientRect();
    if (!rect) return;
    const style: Record<string, string> = {
      left: `${rect.left}px`,
      top: `${rect.bottom + offset}px`,
    };
    if (options.matchTriggerWidth) style.width = `${rect.width}px`;
    menuStyle.value = style;
  }

  function handleDocumentPointerDown(event: PointerEvent) {
    const target = event.target as Node;
    if (!rootRef.value?.contains(target) && !(target instanceof Element && target.closest(menuSelector))) closeMenu();
  }

  function handleWindowScroll(event: Event) {
    const target = event.target as Node | null;
    if (target instanceof Element && target.closest(menuSelector)) return;
    if (target && rootRef.value?.contains(target)) return;
    closeMenu();
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") closeMenu();
  }

  async function openMenu() {
    updateMenuPosition();
    open.value = true;
    await nextTick();
    updateMenuPosition();
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", handleWindowScroll, true);
    window.addEventListener("keydown", handleWindowKeydown);
  }

  function toggleOpen() {
    if (open.value) {
      closeMenu();
      return;
    }
    void openMenu();
  }

  onBeforeUnmount(closeMenu);

  return {
    open,
    rootRef,
    triggerRef,
    menuStyle,
    closeMenu,
    updateMenuPosition,
    toggleOpen,
  };
}
