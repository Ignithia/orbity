<template>
  <canvas
    ref="canvasRef"
    :width="width"
    :height="height"
    :style="style"
    :class="className"
    tabindex="0"
    aria-label="3D tag cloud visualization"
    role="img"
  />
</template>

<script lang="ts">
import { defineComponent, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import Orbity, { OrbityOptions, OrbityTag } from '../index.d';

export default defineComponent({
  name: 'VueOrbity',
  props: {
    tags: { type: Array as () => OrbityTag[], required: true },
    width: { type: Number, default: 800 },
    height: { type: Number, default: 600 },
    style: { type: Object, default: () => ({}) },
    className: { type: String, default: '' },
    options: { type: Object as () => OrbityOptions, default: () => ({}) },
  },
  emits: ['tagClick', 'tagHover', 'tagLeave'],
  setup(props, { emit }) {
    const canvasRef = ref<HTMLCanvasElement | null>(null);
    let orbity: Orbity | null = null;

    onMounted(() => {
      if (canvasRef.value) {
        orbity = new Orbity(canvasRef.value, props.options);
        orbity.setTags(props.tags);
        orbity.on('tagClick', (tag) => emit('tagClick', tag));
        orbity.on('tagHover', (tag) => emit('tagHover', tag));
        orbity.on('tagLeave', (tag) => emit('tagLeave', tag));
      }
    });

    onBeforeUnmount(() => {
      orbity?.destroy();
    });

    watch(() => props.tags, (tags) => {
      orbity?.setTags(tags);
    });

    watch(() => props.options, (options) => {
      orbity?.updateOptions(options);
    });

    return { canvasRef };
  },
});
</script>
