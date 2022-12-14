# Raycast

A WebGL2 raytracer for light rays through a stencil in a foggy environment.

Configured to render the [davidje13.com](https://davidje13.com/) logo.

[Demo Video](https://davidje13.github.io/Raycast/docs/demo.mp4)

[![render1](docs/render1.jpg)](https://davidje13.github.io/Raycast/#{"resolution":1,"lightQuality":70,"time":30.3609245867769,"stencil":{"trace":0.25},"dust":{"opacity":0.3,"reflectivity":1},"lights":[{"pos":{"x":0,"y":-0.66924778761062,"z":-2.2678990590744057},"col":{"r":7.72409167607463,"g":0.341096106157055,"b":0}},{"pos":{"x":0,"y":-0.66924778761062,"z":-2.1858691274694744},"col":{"r":7.6026118594129,"g":2.13440232286792,"b":0}},{"pos":{"x":0,"y":-0.66924778761062,"z":-2.1086328688068723},"col":{"r":6.26633387613394,"g":3.59249340076927,"b":0}},{"pos":{"x":0,"y":-0.66924778761062,"z":-2.0357551669189085},"col":{"r":3.71525772623773,"g":4.46734804751008,"b":0}},{"pos":{"x":0,"y":-0.66924778761062,"z":-1.9668517997855208},"col":{"r":0.5213508798399,"g":4.75896626309035,"b":0.521350879839899}},{"pos":{"x":0,"y":-0.66924778761062,"z":-1.9015822015875694},"col":{"r":0,"g":4.46734804751008,"b":3.71525772623773}},{"pos":{"x":0,"y":-0.66924778761062,"z":-1.83964342564615},"col":{"r":0,"g":3.59249340076927,"b":6.26633387613393}},{"pos":{"x":0,"y":-0.66924778761062,"z":-1.7807650820426582},"col":{"r":0,"g":2.13440232286792,"b":7.6026118594129}},{"pos":{"x":0,"y":-0.66924778761062,"z":-1.7247050711340774},"col":{"r":0,"g":0.341096106157055,"b":7.72409167607463}}],"lightFollow":0,"fog":0.35,"grid":false,"gamma":1.2,"saturation":1.2,"view":{"fovy":1.033007097654388,"eyeSeparation":0,"focusFollow":0,"camera":{"x":0,"y":1.56941371681416,"z":2.10418971238938},"focus":{"x":0,"y":-0.0373340707964602,"z":0},"up":{"x":0,"y":0,"z":1}}})

[![render2](docs/render2.jpg)](https://davidje13.github.io/Raycast/#{"resolution":1,"lightQuality":70,"time":34.0689566115702,"stencil":{"trace":0.25},"dust":{"opacity":0.3,"reflectivity":1.5},"lights":[{"pos":{"x":0,"y":-0.198423672566372,"z":-2.301885537113461},"col":{"r":7.47599451303155,"g":0.330140128443232,"b":0}},{"pos":{"x":0,"y":-0.198423672566372,"z":-2.408908943741008},"col":{"r":7.35841661767588,"g":2.0658455030756,"b":0}},{"pos":{"x":0,"y":-0.198423672566372,"z":-2.5247094101336156},"col":{"r":6.06505976876347,"g":3.47710282044479,"b":0}},{"pos":{"x":0,"y":-0.198423672566372,"z":-2.6504829388550677},"col":{"r":3.59592396629434,"g":4.3238572108663,"b":0}},{"pos":{"x":0,"y":-0.198423672566372,"z":-2.787652501418724},"col":{"r":0.504605134234764,"g":4.60610867434014,"b":0.504605134234764}},{"pos":{"x":0,"y":-0.198423672566372,"z":-2.937924598100105},"col":{"r":0,"g":4.3238572108663,"b":3.59592396629434}},{"pos":{"x":0,"y":-0.198423672566372,"z":-3.103363617423807},"col":{"r":0,"g":3.47710282044479,"b":6.06505976876347}},{"pos":{"x":0,"y":-0.198423672566372,"z":-3.286490892398217},"col":{"r":0,"g":2.0658455030756,"b":7.35841661767588}},{"pos":{"x":0,"y":-0.198423672566372,"z":-3.490418583830157},"col":{"r":0,"g":0.330140128443232,"b":7.47599451303155}}],"lightFollow":0,"fog":0.240804756637168,"grid":false,"gamma":1,"saturation":1.2,"view":{"fovy":0.46149744128283376,"eyeSeparation":0,"focusFollow":0,"camera":{"x":0,"y":0.00691371681416,"z":4.64567201327434},"focus":{"x":0,"y":-0.0027654867256636,"z":0},"up":{"x":0,"y":-1,"z":1}}})

## Rendering

This will render 4800 frames, occupying ~7GB on disk. The resulting video is ~4MB.

1. Launch a server:
   ```sh
   ./server/index.mjs
   ```
2. Open <http://127.0.0.1:3000/> in a browser
3. Apply configuration (e.g. light count = 9)
4. Press "Record" (if this button does not appear, the server is not running)
5. Wait for rendering to complete
6. Convert to a video using `ffmpeg`:
   ```sh
   # full (120fps, 40s, 1920x1080)
   ffmpeg -framerate 120 -i 'rendered/f%06d.png' -codec:v libx265 -crf 26 -preset slow -movflags +faststart -pix_fmt yuv420p -tag:v hvc1 video-full.mp4

   # fast (60fps, 20s, 1920x1080)
   ffmpeg -framerate 240 -i 'rendered/f%06d.png' -filter:v 'tmix=frames=4:weights=1 2 2 1,framestep=4' -codec:v libx265 -crf 28 -preset slow -movflags +faststart -pix_fmt yuv420p -tag:v hvc1 video-fast.mp4

   # demo video (30fps, 20s, 960x540)
   ffmpeg -framerate 240 -i 'rendered/f%06d.png' -filter:v 'scale=iw/2:-1,tmix=frames=8:weights=5 8 9 9 9 9 8 5,framestep=8' -codec:v libx265 -crf 30 -preset slow -movflags +faststart -pix_fmt yuv420p -tag:v hvc1 docs/demo.mp4
   ```
