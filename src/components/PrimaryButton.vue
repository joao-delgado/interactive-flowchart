<template>
  <button
    :class="[ state, 'icon-' + icon ]"
  />
</template>

<script>
export default {
  name: 'PrimaryButton',

  props: {
    state: {
      type: String,
      default: ''
    },
    icon: {
      type: String,
      default: ''
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/assets/variables.css';

button {
  width: 64px;
  height: 64px;
  padding: 0;
  appearance: none;
  border: 2px solid transparent;
  border-radius: 100%;
  background-size: 32px;
  background-position: center;
  background-repeat: no-repeat;
  background-color: rgba(var(--text-color),0.5);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  cursor: pointer;
  transition-property: opacity, visibility, border, background-color, transform, box-shadow;
  transition-duration: var(--transition-duration);
  transition-timing-function: var(--transition-timing);

  &:hover {
    transform: scale(1.0625);
  }

  &.highlighted {
    background-color: rgb(var(--accent-color));
  }

  &.disabled {
    border-color: rgba(var(--text-color),0.15);
    background-color: rgba(var(--background-color),0.65);
    cursor: not-allowed;
    filter: var(--invert-filter);

    &:hover {
      transform: none;
      cursor: not-allowed;
    }
  }

  &.icon-play {
    background-image: url('@/assets/icons/play.svg');
  }

  &.icon-pause {
    background-image: url('@/assets/icons/pause.svg');
  }

  &.icon-return {
    background-image: url('@/assets/icons/return.svg');
  }

  &.icon-jump {
    background-image: url('@/assets/icons/jump.svg');
    transition-property: opacity, visibility, border, background, transform, box-shadow;

    &.disabled {
      background-image: url('@/assets/icons/jump-disabled.svg');

      @at-root .controls.dark-scheme button.icon-jump.disabled {
        background-image: url('@/assets/icons/jump-disabled-light.svg');
      }
    }
  }

  &.icon-info {
    background-image: url('@/assets/icons/info.svg');
  }

  &.icon-buffering {
    background-image: url('@/assets/icons/loading.svg');
    animation: spin 0.75s infinite;
  }
}

@keyframes spin {
  0%, 12.4999% {
    transform: rotate(0deg);
  }

  12.5%, 24.9999% {
    transform: rotate(45deg);
  }

  25%, 37.4999% {
    transform: rotate(90deg);
  }

  37.5%, 49.9999% {
    transform: rotate(135deg);
  }

  50%, 62.4999% {
    transform: rotate(180deg);
  }

  62.5%, 74.9999% {
    transform: rotate(225deg);
  }

  75%, 87.4999% {
    transform: rotate(270deg);
  }

  87.5%, 100% {
    transform: rotate(315deg);
  }
}
</style>