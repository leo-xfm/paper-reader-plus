import { nextTick, onBeforeUnmount, ref } from "vue";

export function useDropdownPopover(menuSelector: string, options: { matchTriggerWidth?: boolean; offset?: number } = {}) {
  const open = ref(false);
  const rootRef = ref<HTMLElement | null>(null);
  const triggerRef = ref<HTMLElement | null>(null);
  const menuStyle = ref<Record<string, string>>({});
  const offset = options.offset ?? 9;

  function closeMenu() {
    open.value = false;
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
    window.removeEventListener("resize", closeMenu);
    window.removeEventListener("scroll", closeMenu, true);
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

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") closeMenu();
  }

  async function openMenu() {
    updateMenuPosition();
    open.value = true;
    await nextTick();
    updateMenuPosition();
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
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
