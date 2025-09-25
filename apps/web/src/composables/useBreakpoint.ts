import { onBeforeUnmount, onMounted, ref } from 'vue';

export function useBreakpoint(targetWidth = 1024) {
  const isAbove = ref(false);

  const update = () => {
    isAbove.value = window.matchMedia(`(min-width: ${targetWidth}px)`).matches;
  };

  onMounted(() => {
    update();
    window.addEventListener('resize', update);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', update);
  });

  return { isAbove };
}
