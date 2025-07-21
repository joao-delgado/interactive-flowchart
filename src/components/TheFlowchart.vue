<template>
  <div ref="container" class="flowchart">
    <InlineSvg
      src="flowchart.svg"
      :class="{ ready: flowchartElement }"
      @loaded="flowchartReady($event)"
    />
  </div>
</template>

<script>
import { mapStores } from 'pinia';
import { scaleLinear, easeExpOut } from 'd3';

import InlineSvg from 'vue-inline-svg';

import { useFlowchartStore } from '@/stores/FlowchartStore.js';
import { useViewStore } from '@/stores/ViewStore.js';

export default {
  name: 'TheFlowchart',

  components: {
    InlineSvg
  },

  emits: [
    'setCurrentNodeId',
    'jumpNarrationToNode',
    'startPlayback',
    'startExplorationDuringPlayback',
    'stopExplorationDuringPlayback',
    'toggleIntroPanel'
  ],

  data() {
    return {
      // flowchart container/svg elements
      flowchartContainer: undefined,
      flowchartElement: undefined,

      // flowchart dimensions
      flowchartWidth: 0,
      flowchartHeight: 0,

      // window dimensions
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      shortestWindowSideLength: Math.min(window.innerWidth, window.innerHeight),

      // flowchart scaling parameters
      scaleParameters: {
        domain: [300, 600],
        range: [0.85, 1],
        minReductionFactor: 0.75
      },
      scaleFromWindowSideLength: undefined,

      // coordinates stored during panning/dragging
      panCoordinates: undefined,

      // parameters for movement/transitions to nodes
      transitionParameters: {
        screenSizeFactor: 0.15,
        maxTravelThreshold: 256,
        distanceFactor: 1.5,
        minDuration: 500,
        maxDuration: 1000
      },

      // count of how many times teased nodes have been attempted to be clicked
      teasedClickAttempts: 0,
      
      // fixed pixel values
      introPanelWidth: 416,
      fullWidthIntroPanelThreshold: 600,
      horizontalCenterOffset: 24,
    }
  },

  computed: {
    ...mapStores(
      useFlowchartStore,
      useViewStore
    ),
    // calculates scale factor for flowchart element extent based on window dimensions
    zoomScale() {
      return this.scaleFromWindowSideLength(this.shortestWindowSideLength);
    },
    // calculates travel distance threshold below which no movement happens when a new node becomes active during narration
    travelThreshold() {
      return Math.min(
        this.shortestWindowSideLength * this.transitionParameters.screenSizeFactor,
        this.transitionParameters.maxTravelThreshold
      );
    }
  },

  methods: {
    // flowchart inline SVG loaded
    flowchartReady(element) {
      this.flowchartContainer = this.$refs.container;
      this.flowchartElement = element;

      // store initial dimensions of flowchart svg elements for scaling
      const viewBox = element.viewBox.baseVal;
      this.flowchartWidth = viewBox.width;
      this.flowchartHeight = viewBox.height;

      // set window dimension properties and scaled flowchart width and height upon window resize
      window.addEventListener('resize', () => {
        this.windowWidth = window.innerWidth;
        this.windowHeight = window.innerHeight;
        this.shortestWindowSideLength = Math.min(window.innerWidth, window.innerHeight);

        this.flowchartElement.setAttribute('width', this.flowchartWidth * this.zoomScale);
        this.flowchartElement.setAttribute('height', this.flowchartHeight * this.zoomScale);
      });

      // dispatch resize event to initially set scaled flowchart width and height
      window.dispatchEvent(new Event('resize'));

      // stop playback and hide chapter list / intro panel upon user-initiated scrolling
      ['wheel', 'touchmove'].forEach(eventName => {
        this.flowchartContainer.addEventListener(eventName, () => {
          if (this.flowchartStore.playbackActive) {
            this.$emit('startExplorationDuringPlayback');
          }

          this.$emit('toggleIntroPanel', true);
        });
      });

      // panning/scrolling of flowchart via click-and-drag
      this.flowchartContainer.addEventListener('mousedown', event => {
        // only start panning if drag was not initiated above visible node
        if (!event.target.closest('[id^=n-].teased, [id^=n-].revealed, [id^=n-].next, [id^=n-].current')) {
          if (this.flowchartStore.playbackActive) {
            this.$emit('startExplorationDuringPlayback');
          }

          this.flowchartContainer.classList.add('panning');

          this.panCoordinates = {
            xScroll: this.flowchartContainer.scrollLeft,
            yScroll: this.flowchartContainer.scrollTop,
            xPointer: event.clientX,
            yPointer: event.clientY
          };

          this.flowchartContainer.addEventListener('mousemove', mousemoveHandler);
          this.flowchartContainer.addEventListener('mouseup', mouseupHandler);
        }

        event.preventDefault();
      });

      // scroll flowchart container based on delta between start of drag and current pointer position
      const mousemoveHandler = event => {
        const xDelta = event.clientX - this.panCoordinates.xPointer;
        const yDelta = event.clientY - this.panCoordinates.yPointer;

        this.flowchartContainer.scrollTo({
          left: this.panCoordinates.xScroll - xDelta,
          top: this.panCoordinates.yScroll - yDelta,
          behavior: 'instant'
        });
      };

      // end of panning/dragging
      const mouseupHandler = () => {
        this.panCoordinates = undefined;
        this.flowchartContainer.classList.remove('panning');
        this.flowchartContainer.removeEventListener('mousemove', mousemoveHandler);
        this.flowchartContainer.removeEventListener('mouseup', mouseupHandler);
      };

      this.collectNodes();
    },

    // populate flowchartStore’s flowchartNodes object with nodes from svg source
    collectNodes() {
      const nodes = [...this.flowchartElement.querySelectorAll('[id^=n-]')];
      const primaryNodes = nodes.filter(node => !isNaN(node.id.slice(-1)));
      const alternateNodes = nodes.filter(node => !primaryNodes.includes(node));

      primaryNodes.forEach(nodeElement => {
        const nodeId = nodeElement.id;
        console.log('processing node: ' + nodeId);

        const alternates = {};
        const alternatesArray = alternateNodes.filter(alternateNode => alternateNode.id.startsWith(nodeId));

        alternatesArray.forEach(alternateNode => {
          alternates[alternateNode.id.split('_')[1]] = alternateNode;
        });
        
        this.flowchartStore.flowchartNodes[nodeId] = {
          element: nodeElement,
          alternates,
          outgoing: [],
          incoming: []
        };
      });

      const edges = [...this.flowchartElement.querySelectorAll('[id^=e-]')];
      const primaryEdges = edges.filter(edge => !isNaN(edge.id.slice(-1)));
      const alternateEdges = edges.filter(edge => !primaryEdges.includes(edge));

      primaryEdges.forEach(edgeElement => {
        console.log('processing edge: ' + edgeElement.id);
        const edgeNodes = edgeElement.id.split('-');
        const edgeFrom = 'n-' + edgeNodes[1];
        const edgeTo = 'n-' + edgeNodes[2];
        const bidirectionalEdge = edgeNodes.length >= 4 && isNaN(edgeNodes[3]);

        const alternates = {};
        const alternatesArray = alternateEdges.filter(alternateEdge => alternateEdge.id.startsWith(edgeElement.id));

        alternatesArray.forEach(alternateEdge => {
          alternates[alternateEdge.id.split('_')[1]] = alternateEdge;
        });

        this.flowchartStore.flowchartNodes[edgeFrom].outgoing.push({
          edge: edgeElement,
          node: this.flowchartStore.flowchartNodes[edgeTo],
          alternates
        });
        this.flowchartStore.flowchartNodes[edgeTo].incoming.push({
          edge: edgeElement,
          node: this.flowchartStore.flowchartNodes[edgeFrom],
          alternates
        });

        // if edge is bidirectional, additionally add the same edge in reverse to the destination/origin node
        if (bidirectionalEdge) {
          this.flowchartStore.flowchartNodes[edgeTo].outgoing.push({
            edge: edgeElement,
            node: this.flowchartStore.flowchartNodes[edgeFrom],
            alternates
          });
          this.flowchartStore.flowchartNodes[edgeFrom].incoming.push({
            edge: edgeElement,
            node: this.flowchartStore.flowchartNodes[edgeTo],
            alternates
          });
        }
      });

      this.addNodeInteractivity();
      this.moveToNode(this.flowchartStore.currentNode);
    },

    // attach click listeners to node elements
    addNodeInteractivity() {
      const vueInstance = this;

      Object.entries(this.flowchartStore.flowchartNodes).forEach(([nodeId, node]) => {
        node.element.addEventListener('click', function() {
          const nodeClickable = ['revealed', 'next', 'current'].includes(this.getAttribute('data-state'));

          if (nodeClickable) {
            // stop exploration during playback if active
            if (vueInstance.flowchartStore.playbackActive && vueInstance.flowchartStore.exploringDuringPlayback) {
              vueInstance.$emit('stopExplorationDuringPlayback');
            }

            // if clicked node is different from current node, either jump narration to that node (if playback is active)
            // or set node ID without affecting narration; otherwise re-center current node
            if (nodeId !== vueInstance.flowchartStore.currentNodeId) {
              if (vueInstance.flowchartStore.playbackActive) {
                vueInstance.$emit('jumpNarrationToNode', nodeId);
              } else {
                vueInstance.$emit('setCurrentNodeId', nodeId);
              }
            } else {
              vueInstance.moveToNode(vueInstance.flowchartStore.currentNode, true);
            }
          } else if (this.getAttribute('data-state') === 'teased') {
            // if teased node is clicked, trigger the pulse animation for all incoming nodes
            node.incoming.forEach(incomingObject => {
              let incomingNode = incomingObject.node.element;

              if (vueInstance.flowchartStore.revealedItems.includes(incomingNode.id)) {
                incomingNode = vueInstance.findReplacementElement(incomingNode, incomingNode.getAttribute('data-state')) ?? incomingNode;
  
                incomingNode.classList.remove('pulse');
                void incomingNode.getBBox(); // trigger reflow
                incomingNode.classList.add('pulse');
              }
            });

            // display hint alert upon third click attempt
            vueInstance.teasedClickAttempts++;
            if (vueInstance.teasedClickAttempts === 3) {
              alert('In order to reveal this item of the flowchart, please select any item pointing here first.');
            }
          }
        });
      });
    },

    // scroll the flowchart to center on an item
    moveToNode(item, forceMovement = false) {
      const itemPosition = item.element.getBBox();
      const destinationCoords = {
        x: (itemPosition.x + itemPosition.width / 2) * this.zoomScale - (
          this.viewStore.introPanelVisible && this.windowWidth > this.fullWidthIntroPanelThreshold
            ? this.introPanelWidth / 2 - this.horizontalCenterOffset
            : 0
        ),
        y: (itemPosition.y + itemPosition.height / 2) * this.zoomScale + this.windowHeight * 0.05
      };

      const currentCoords = {
        x: this.flowchartContainer.scrollLeft,
        y: this.flowchartContainer.scrollTop
      };

      const travelDistance = Math.sqrt(
        Math.pow(currentCoords.x - destinationCoords.x, 2) + Math.pow(currentCoords.y - destinationCoords.y, 2)
      );

      // omit movement if playback is active and distance from viewport center to destination node falls below threshold
      if (forceMovement || !this.flowchartStore.playbackActive || travelDistance > this.travelThreshold) {
        const duration = Math.min(
          Math.max(
            travelDistance * this.transitionParameters.distanceFactor,
            this.transitionParameters.minDuration
          ),
          this.transitionParameters.maxDuration
        );

        this.smoothScroll(destinationCoords.x, destinationCoords.y, duration);
      }

      this.updateAppearance();
    },

    // smooth scroll to coordinate using custom duration and easing
    smoothScroll(xEnd, yEnd, duration) {
      const time = Date.now();
      const xStart = this.flowchartContainer.scrollLeft;
      const yStart = this.flowchartContainer.scrollTop;

      const step = () => {
        const elapsed = Date.now() - time;
        const scrolling = elapsed < duration;
        const x = scrolling ? xStart + (xEnd - xStart) * easeExpOut(elapsed / duration) : xEnd;
        const y = scrolling ? yStart + (yEnd - yStart) * easeExpOut(elapsed / duration) : yEnd;

        if (scrolling) {
          requestAnimationFrame(step);
        }

        this.flowchartContainer.scrollTo({
          left: x,
          top: y,
          behavior: 'instant'
        });
      }

      step();
    },

    // update classes/appearance of svg elements
    updateAppearance() {
      // outgoing nodes are iterated over again further down, sequence could be improved
      this.flowchartStore.currentNode.outgoing.forEach(item => {
        this.markItemAsRevealed(item.edge);
        this.markItemAsRevealed(item.node.element);

        item.node.outgoing.forEach(subsequentItem => {
          this.markItemAsTeased(subsequentItem.edge);
          this.markItemAsTeased(subsequentItem.node.element);
        });
      });

      this.flowchartElement.querySelectorAll('[id^=n-], [id^=e-]').forEach(element => {
        element.classList.remove('replaced-out', 'replaced-in');
      });

      this.flowchartStore.teasedItems.forEach(id => {
        document.getElementById(id).setAttribute('data-state', 'teased');
      });

      this.flowchartStore.revealedItems.forEach(id => {
        document.getElementById(id).setAttribute('data-state', 'revealed');
      });

      this.flowchartStore.currentNode.outgoing.forEach(item => {
        item.edge.setAttribute('data-state', 'next');
        item.node.element.setAttribute('data-state', 'next');
      });

      this.flowchartStore.currentNode.element.setAttribute('data-state', 'current');
      this.markItemAsRevealed(this.flowchartStore.currentNode.element);

      // replace primary elements with alternate state variants if those exist
      ['teased', 'revealed', 'next', 'current'].forEach(state => {
        this.flowchartElement.querySelectorAll('[data-state=' + state +']').forEach(element => {
          const replacementElement = this.findReplacementElement(element, state);

          if (replacementElement) {
            element.classList.add('replaced-out');
            replacementElement.classList.add('replaced-in');
          }
        })
      });
    },

    // return replacement for element and certain state if it exists
    findReplacementElement(element, state) {
      return document.getElementById(element.id + '_' + state);
    },

    // add node element to revealedItems array
    markItemAsRevealed(node) {
      if (this.flowchartStore.revealedItems.indexOf(node.id) === -1) {
        this.flowchartStore.revealedItems.push(node.id);
      }
    },

    // add node element to teasedItems array
    markItemAsTeased(node) {
      if (this.flowchartStore.teasedItems.indexOf(node.id) === -1) {
        this.flowchartStore.teasedItems.push(node.id);
      }
    },

    // add timestamp/event index to listenedTimestampIndexes array
    markTimestampAsListened(index) {
      if (this.flowchartStore.listenedTimestampIndexes.indexOf(index) === -1) {
        this.flowchartStore.listenedTimestampIndexes.push(index);
      }
    }
  },

  watch: {
    // when a new node ID is set, move to the updated (now current) node ID,
    // unless exploration during playback is active, in which case only refresh appearance
    'flowchartStore.currentNodeId'() {
      if (!this.flowchartStore.exploringDuringPlayback) {
        this.moveToNode(this.flowchartStore.currentNode);
      } else {
        this.updateAppearance();
      }
    },

    // update current node ID upon change of narration node ID (which changes based on playback position)
    'flowchartStore.currentNarrationNodeId'() {
      this.$emit('setCurrentNodeId', this.flowchartStore.currentNarrationNodeId);

      // start playback if not active already (happens when jumpNarrationToNode is triggered)
      if (!this.flowchartStore.playbackActive) {
        this.$emit('startPlayback', true);
      }
    },

    // when the narration index changes, mark that timestamp/event as listened
    'flowchartStore.currentNarrationNodeIndex'() {
      this.markTimestampAsListened(this.flowchartStore.currentNarrationNodeIndex);
    },

    // when playback is started, move to current node (if current node
    // does not change, no movement is otherwise initiated)
    'flowchartStore.playbackActive'() {
      if (this.flowchartStore.playbackActive) {
        this.moveToNode(this.flowchartStore.currentNode);
      }
    },

    // move back to current node if exploration during playback ends
    'flowchartStore.exploringDuringPlayback'() {
      if (!this.flowchartStore.exploringDuringPlayback && this.flowchartStore.playbackActive) {
        this.moveToNode(this.flowchartStore.currentNode, true);
      }
    },
  },

  created() {
    // d3 scaleLinear method to map window dimensions to min/max scale thresholds
    this.scaleFromWindowSideLength = scaleLinear(this.scaleParameters.domain, this.scaleParameters.range).clamp(true);
  }
}
</script>

<style lang="scss">
@import '@/assets/variables.css';

.flowchart {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  cursor: grab;
  -webkit-user-select: none;
  user-select: none;
  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    -webkit-appearance: none;
    width: 0;
    height: 0;
  }

  &.panning {
    cursor: grabbing;
  }

  svg {
    opacity: 0;
    visibility: hidden;
    margin: 50vh 50vw;
    transition: opacity 0.25s var(--transition-timing), visibility 0.25s var(--transition-timing);

    &.ready {
      opacity: 1;
      visibility: visible;
    }

    // nodes
    [id^=n-] {
      opacity: 0;
      pointer-events: none;

      &:hover {
        cursor: pointer;
      }

      // primary nodes (ending in a number)
      &[id$='0'],
      &[id$='1'],
      &[id$='2'],
      &[id$='3'],
      &[id$='4'],
      &[id$='5'],
      &[id$='6'],
      &[id$='7'],
      &[id$='8'],
      &[id$='9'] {
        pointer-events: all;
      }

      &[data-state=teased] {
        cursor: not-allowed;
      }

      &[data-state=teased]:not(.replaced-out) {
        opacity: 0.2;
      }

      &[data-state=revealed]:not(.replaced-out),
      &[data-state=next]:not(.replaced-out),
      &[data-state=current]:not(.replaced-out),
      &.replaced-in {
        opacity: 1;
      }

      &.pulse {
        animation: pulse 0.6s 1 backwards ease-in-out;
      }
    }

    // edges
    [id^=e-] {
      opacity: 0;
      pointer-events: none;

      &[data-state=teased]:not(.replaced-out) {
        opacity: 0.2;
      }

      &[data-state=revealed]:not(.replaced-out),
      &[data-state=next]:not(.replaced-out),
      &.replaced-in {
        opacity: 1;
      }
    }
  }
}

@keyframes pulse {
  0%, 50%, 100% {
    opacity: 1;
  }

  25%, 75% {
    opacity: 0.35;
  }
}
</style>