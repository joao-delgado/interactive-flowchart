<template>
  <div class="controls">
    <ThePlayButton
      class="playback"
      @click="$emit(flowchartStore.exploringDuringPlayback ? 'stopExplorationDuringPlayback' : 'togglePlayback')"
    />
    <div ref="chapters" class="chapters" :class="{ shadow: !viewStore.introPanelVisible, playing: flowchartStore.playbackActive }">
      <div class="drawer">
        <span>
          {{ flowchartStore.prettyPlaybackPosition }}
          <em>{{ flowchartStore.prettyPlaybackDuration }}</em>
        </span>
      </div>
    </div>
    <PrimaryButton
      class="jump"
      :class="{ visible: flowchartStore.movedAwayFromNarration, shadow: !viewStore.introPanelVisible }"
      :state="flowchartStore.jumpActionAvailable ? 'highlighted' : 'disabled'"
      icon="jump"
      :title="flowchartStore.jumpActionAvailable ? 'Resume narration from selected item' : 'Narration not available for selected item'"
      :tabindex="!flowchartStore.jumpActionAvailable ? -1 : ''"
      @click="$emit('jumpNarrationToNode', flowchartStore.currentNodeId)"
    />
  </div>
</template>

<script>
import { mapStores } from 'pinia';

import ThePlayButton from '@/components/ThePlayButton.vue';
import PrimaryButton from '@/components/PrimaryButton.vue';

import { useFlowchartStore } from '@/stores/FlowchartStore.js';
import { useViewStore } from '@/stores/ViewStore.js';

export default {
  name: 'ThePlaybackControls',

  components: {
    ThePlayButton,
    PrimaryButton
  },

  emits: [
    'jumpNarrationToNode',
    'togglePlayback',
    'stopExplorationDuringPlayback'
  ],

  computed: {
    ...mapStores(
      useFlowchartStore,
      useViewStore
    )
  },

  watch: {
    // hacky way to keep the chapter list’s background blur active on Safari when controls are full-width
    'flowchartStore.playbackActive'() {
      if (this.flowchartStore.playbackActive === false && this.$refs.chapters.style['-webkit-backdrop-filter'] !== undefined) {
        this.$refs.chapters.style['-webkit-backdrop-filter'] = `blur(${ 16 + Math.random() / 100 }px)`;
      }
    }
  }
}
</script>

<style lang="scss">
@import '@/assets/variables.css';

.controls {
  position: absolute;
  z-index: 101;
  bottom: 16px;
  left: 16px;
  right: 16px;
  width: 460px;
  line-height: 20px;
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;

  > * {
    vertical-align: bottom;
    pointer-events: all;
  }

  .playback {
    position: absolute;
    z-index: 1;
    bottom: 0;
  }

  .chapters {
    position: relative;
    display: inline-block;
    overflow: hidden;
    width: 150px;
    height: 64px;
    border-radius: 32px;
    background:
      linear-gradient(to top, rgba(var(--text-color), 0.1), rgba(var(--text-color), 0.1)),
      linear-gradient(to top, rgba(var(--background-color),0.65), rgba(var(--background-color),0.65));
    -webkit-backdrop-filter: blur(16px);
    backdrop-filter: blur(16px);
    box-shadow: 0 0 0 0 rgb(var(--background-color));
    transition-property: width, height, box-shadow;
    transition-duration: var(--transition-duration), var(--transition-duration), var(--transition-duration-long);
    transition-timing-function: var(--transition-timing);

    &.shadow {
      box-shadow: 0 0 0 2px rgb(var(--background-color));
    }

    .drawer {
      position: absolute;
      display: flex;
      align-items: center;
      bottom: 0;
      left: 32px;
      right: 0;
      height: 64px;
      padding-left: 48px;
      box-shadow: inset 0 1px 0 transparent;

      span {
        width: 100%;
        padding-bottom: 1px;
        line-height: 18px;

        em {
          display: block;
          font-style: normal;
          color: rgba(var(--text-color),0.35);
        }
      }
    }
  }

  button.jump {
    visibility: hidden;
    opacity: 0;
    margin-left: 12px;
    box-shadow: 0 0 0 0px rgb(var(--background-color));

    &.visible {
      visibility: visible;
      opacity: 1;
    }

    &.shadow {
      box-shadow: 0 0 0 2px rgb(var(--background-color));
    }
  }
}
</style>