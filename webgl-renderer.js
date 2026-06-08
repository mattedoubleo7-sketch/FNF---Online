(function(){
  function createShader(gl, type, source){
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(info || "shader compile failed");
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource){
    const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if(!gl.getProgramParameter(program, gl.LINK_STATUS)){
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(info || "shader link failed");
    }
    return program;
  }

  function clamp(value, min, max){
    const number = Number(value) || 0;
    return Math.max(min, Math.min(max, number));
  }

  function createBridge(canvas, ctx){
    const state = {
      canvas,
      ctx,
      fxCanvas: null,
      gl: null,
      failed: false,
      failReason: "",
      width: 0,
      height: 0,
      camera: null,
      parallax: null,
      speedLines: null,
      dustinPost: null
    };

    function markFailed(error){
      state.failed = true;
      state.failReason = error && error.message ? error.message : String(error || "WebGL unavailable");
      return false;
    }

    function ensureContext(){
      if(state.failed) return null;
      if(state.gl) return state.gl;
      try {
        state.fxCanvas = document.createElement("canvas");
        const gl = state.fxCanvas.getContext("webgl", {
          alpha: true,
          antialias: false,
          depth: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
          stencil: false
        }) || state.fxCanvas.getContext("experimental-webgl", {
          alpha: true,
          antialias: false,
          depth: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
          stencil: false
        });
        if(!gl) return markFailed("WebGL context unavailable");
        gl.getExtension("OES_standard_derivatives");
        state.fxCanvas.addEventListener("webglcontextlost", event => {
          event.preventDefault();
          markFailed("WebGL context lost");
        });
        state.gl = gl;
        return gl;
      } catch(error) {
        markFailed(error);
        return null;
      }
    }

    function syncSize(){
      if(!state.fxCanvas) return false;
      if(state.width === canvas.width && state.height === canvas.height) return true;
      state.width = canvas.width;
      state.height = canvas.height;
      state.fxCanvas.width = canvas.width;
      state.fxCanvas.height = canvas.height;
      return state.width > 0 && state.height > 0;
    }

    function ensureCameraPass(){
      const gl = ensureContext();
      if(!gl) return null;
      if(state.camera) return state.camera;
      try {
        const program = createProgram(gl, `
          attribute vec2 aPosition;
          attribute vec2 aTexCoord;
          varying vec2 vUv;
          void main(){
            vUv = aTexCoord;
            gl_Position = vec4(aPosition, 0.0, 1.0);
          }
        `, `
          precision mediump float;
          uniform sampler2D uTexture;
          uniform float uZoom;
          uniform float uAngle;
          uniform vec2 uOffset;
          uniform float uWarp;
          uniform float uMirror;
          varying vec2 vUv;

          vec2 mirrorRepeat(vec2 uv){
            vec2 repeated = mod(uv, 2.0);
            return mix(repeated, 2.0 - repeated, step(vec2(1.0), repeated));
          }

          void main(){
            vec2 centered = vUv - 0.5;
            float radiansAngle = radians(uAngle);
            float s = sin(radiansAngle);
            float c = cos(radiansAngle);
            centered = mat2(c, -s, s, c) * centered;
            centered *= max(0.05, uZoom);
            float radius = dot(centered, centered);
            vec2 warped = centered;
            warped.x += centered.y * uWarp * (0.09 + radius * 1.05);
            warped.y += centered.x * uWarp * (0.04 + radius * 0.45);
            vec2 sampleUv = warped + 0.5 + uOffset;
            vec2 edgeUv = mirrorRepeat(sampleUv);
            vec4 color = texture2D(uTexture, edgeUv);
            float edge = smoothstep(0.98, 1.32, max(abs(sampleUv.x - 0.5), abs(sampleUv.y - 0.5)) * 2.0);
            color.rgb *= 1.0 + edge * uMirror * 0.07;
            gl_FragColor = vec4(color.rgb, 1.0);
          }
        `);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
          -1, -1, 0, 0,
           1, -1, 1, 0,
          -1,  1, 0, 1,
           1,  1, 1, 1
        ]), gl.STATIC_DRAW);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        state.camera = {
          program,
          buffer,
          texture,
          aPosition: gl.getAttribLocation(program, "aPosition"),
          aTexCoord: gl.getAttribLocation(program, "aTexCoord"),
          uTexture: gl.getUniformLocation(program, "uTexture"),
          uZoom: gl.getUniformLocation(program, "uZoom"),
          uAngle: gl.getUniformLocation(program, "uAngle"),
          uOffset: gl.getUniformLocation(program, "uOffset"),
          uWarp: gl.getUniformLocation(program, "uWarp"),
          uMirror: gl.getUniformLocation(program, "uMirror")
        };
        return state.camera;
      } catch(error) {
        markFailed(error);
        return null;
      }
    }

    function ensureParallaxPass(){
      const gl = ensureContext();
      if(!gl) return null;
      if(state.parallax) return state.parallax;
      try {
        const program = createProgram(gl, `
          attribute vec2 aPosition;
          attribute vec2 aTexCoord;
          varying vec2 vUv;
          void main(){
            vUv = aTexCoord;
            gl_Position = vec4(aPosition, 0.0, 1.0);
          }
        `, `
          precision mediump float;
          uniform sampler2D uTexture;
          uniform float uAmount;
          uniform float uTime;
          uniform vec2 uCamera;
          uniform float uZoom;
          varying vec2 vUv;

          vec2 mirrorRepeat(vec2 uv){
            vec2 repeated = mod(uv, 2.0);
            return mix(repeated, 2.0 - repeated, step(vec2(1.0), repeated));
          }

          void main(){
            float skyLock = smoothstep(0.18, 0.88, vUv.y);
            float nearDepth = pow(skyLock, 1.65);
            float farDepth = smoothstep(0.08, 0.55, vUv.y) * (1.0 - nearDepth) * 0.35;
            float wave = sin((vUv.y * 7.0) + uTime * 0.75) * 0.004 * uAmount;
            vec2 offset = vec2(0.0);
            offset.x += uCamera.x * (nearDepth * 0.075 + farDepth * 0.018) * uAmount;
            offset.y += uCamera.y * (nearDepth * 0.052 + farDepth * 0.014) * uAmount;
            offset.x += wave * nearDepth;
            vec2 centered = vUv - 0.5;
            centered *= 1.0 + max(0.0, uZoom) * nearDepth * uAmount * 0.085;
            vec2 sampleUv = mirrorRepeat(centered + 0.5 + offset);
            vec4 color = texture2D(uTexture, sampleUv);
            float shade = 1.0 + nearDepth * uAmount * 0.025 - farDepth * uAmount * 0.018;
            gl_FragColor = vec4(color.rgb * shade, color.a);
          }
        `);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
          -1, -1, 0, 0,
           1, -1, 1, 0,
          -1,  1, 0, 1,
           1,  1, 1, 1
        ]), gl.STATIC_DRAW);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        state.parallax = {
          program,
          buffer,
          texture,
          aPosition: gl.getAttribLocation(program, "aPosition"),
          aTexCoord: gl.getAttribLocation(program, "aTexCoord"),
          uTexture: gl.getUniformLocation(program, "uTexture"),
          uAmount: gl.getUniformLocation(program, "uAmount"),
          uTime: gl.getUniformLocation(program, "uTime"),
          uCamera: gl.getUniformLocation(program, "uCamera"),
          uZoom: gl.getUniformLocation(program, "uZoom")
        };
        return state.parallax;
      } catch(error) {
        markFailed(error);
        return null;
      }
    }

    function ensureSpeedLinePass(){
      const gl = ensureContext();
      if(!gl) return null;
      if(state.speedLines) return state.speedLines;
      try {
        const program = createProgram(gl, `
          attribute vec2 aPosition;
          attribute vec2 aTexCoord;
          varying vec2 openfl_TextureCoordv;
          void main(){
            openfl_TextureCoordv = aTexCoord;
            gl_Position = vec4(aPosition, 0.0, 1.0);
          }
        `, `
          precision mediump float;
          uniform float iTime;
          uniform float effect;
          uniform vec2 uCenter;
          varying vec2 openfl_TextureCoordv;

          float mod289(float x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
          vec4 mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
          vec4 perm(vec4 x){return mod289(((x * 34.0) + 1.0) * x);}

          float noise(vec3 p){
            vec3 a = floor(p);
            vec3 d = p - a;
            d = d * d * (3.0 - 2.0 * d);
            vec4 b = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0);
            vec4 k1 = perm(b.xyxy);
            vec4 k2 = perm(k1.xyxy + b.zzww);
            vec4 c = k2 + a.zzzz;
            vec4 k3 = perm(c);
            vec4 k4 = perm(c + 1.0);
            vec4 o1 = fract(k3 * (1.0 / 41.0));
            vec4 o2 = fract(k4 * (1.0 / 41.0));
            vec4 o3 = o2 * d.z + o1 * (1.0 - d.z);
            vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);
            return o4.y * d.y + o4.x * (1.0 - d.y);
          }

          void main(){
            vec2 uv = openfl_TextureCoordv.xy;
            vec2 centeredUV = uv - uCenter;
            float dist = length(centeredUV);
            vec2 dir = dist > 0.001 ? normalize(centeredUV) * (50.0 + noise(vec3(iTime))) : vec2(0.0);
            float amount = noise(vec3(dir, iTime * 25.0)) * noise(vec3(dir, iTime * 30.0));
            amount *= smoothstep(0.2, 0.7, dist);
            if(amount > 0.2)
              amount *= 3.0;
            else
              amount = 0.0;
            if(noise(vec3(dir, iTime)) > effect)
              amount = 0.0;
            gl_FragColor = vec4(vec3(amount), clamp(amount * 0.82, 0.0, 1.0));
          }
        `);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
          -1, -1, 0, 0,
           1, -1, 1, 0,
          -1,  1, 0, 1,
           1,  1, 1, 1
        ]), gl.STATIC_DRAW);
        state.speedLines = {
          program,
          buffer,
          aPosition: gl.getAttribLocation(program, "aPosition"),
          aTexCoord: gl.getAttribLocation(program, "aTexCoord"),
          uTime: gl.getUniformLocation(program, "iTime"),
          uEffect: gl.getUniformLocation(program, "effect"),
          uCenter: gl.getUniformLocation(program, "uCenter")
        };
        return state.speedLines;
      } catch(error) {
        markFailed(error);
        return null;
      }
    }

    function ensureDustinPostPass(){
      const gl = ensureContext();
      if(!gl) return null;
      if(state.dustinPost) return state.dustinPost;
      try {
        const program = createProgram(gl, `
          attribute vec2 aPosition;
          attribute vec2 aTexCoord;
          varying vec2 vUv;
          void main(){
            vUv = aTexCoord;
            gl_Position = vec4(aPosition, 0.0, 1.0);
          }
        `, `
          #extension GL_OES_standard_derivatives : enable
          precision mediump float;
          uniform sampler2D uTexture;
          uniform vec2 uTextureSize;
          uniform vec2 uRes;
          uniform float uTime;
          uniform float uGrayness;
          uniform float uStaticStrength;
          uniform float uChromDistortion;
          uniform float uWaterStrength;
          uniform float uGlitchAmount;
          uniform float uPixelBlockSize;
          uniform float uBloomBrightness;
          uniform float uBloomSize;
          uniform float uBloomThreshold;
          uniform float uFogIntensity;
          uniform float uFogApplyY;
          uniform float uFogApplyRange;
          uniform float uCameraZoom;
          uniform vec2 uCameraPosition;
          uniform float uSnowTime;
          uniform float uSnowBrightA;
          uniform float uSnowBrightB;
          uniform float uSnowLayersA;
          uniform float uSnowLayersB;
          uniform float uSnowPixely;
          uniform float uSnowMeltsA;
          uniform float uSnowMeltsB;
          uniform vec4 uSnowMeltRect;
          varying vec2 vUv;

          #define PI 3.1415926535897932384626433832795
          #define TWO_PI 6.283185307179586476925286766559

          float rand2(vec2 co){
            return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
          }

          float waterRand(vec2 n){
            return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
          }

          float waterNoise(vec2 n){
            const vec2 d = vec2(0.0, 1.0);
            vec2 b = floor(n);
            vec2 f = smoothstep(vec2(0.0), vec2(1.0), fract(n));
            return mix(mix(waterRand(b), waterRand(b + d.yx), f.x), mix(waterRand(b + d.xy), waterRand(b + d.yy), f.x), f.y);
          }

          vec2 pincushionDistortion(vec2 uv, float strength){
            vec2 st = uv - 0.5;
            float uvA = atan(st.x, st.y);
            float uvD = dot(st, st);
            return 0.5 + vec2(sin(uvA), cos(uvA)) * sqrt(uvD) * (1.0 - strength * uvD);
          }

          float glitchHash(vec2 v){
            return fract(sin(dot(v, vec2(89.44, 19.36))) * 22189.22);
          }

          float glitchIHash(vec2 v, vec2 r){
            float h00 = glitchHash(vec2(floor(v * r + vec2(0.0, 0.0)) / r));
            float h10 = glitchHash(vec2(floor(v * r + vec2(1.0, 0.0)) / r));
            float h01 = glitchHash(vec2(floor(v * r + vec2(0.0, 1.0)) / r));
            float h11 = glitchHash(vec2(floor(v * r + vec2(1.0, 1.0)) / r));
            vec2 ip = smoothstep(vec2(0.0), vec2(1.0), mod(v * r, 1.0));
            return (h00 * (1.0 - ip.x) + h10 * ip.x) * (1.0 - ip.y) + (h01 * (1.0 - ip.x) + h11 * ip.x) * ip.y;
          }

          float glitchNoise(vec2 v){
            float sum = 0.0;
            for(int i = 1; i < 9; i++){
              float fi = float(i);
              sum += glitchIHash(v + vec2(fi), vec2(2.0 * pow(2.0, fi))) / pow(2.0, fi);
            }
            return sum;
          }

          vec2 fogRandom2(vec2 st){
            st = vec2(dot(st, vec2(127.1, 311.7)), dot(st, vec2(269.5, 183.3)));
            return -1.0 + 2.0 * fract(sin(st) * 43759.34517123);
          }

          float fogNoise(vec2 st){
            vec2 i = floor(st);
            vec2 f = fract(st);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(dot(fogRandom2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                  dot(fogRandom2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
              mix(dot(fogRandom2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                  dot(fogRandom2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
              u.y
            );
          }

          float fogFbm(vec2 coord){
            float value = 0.0;
            float scale = 0.5;
            for(int i = 0; i < 4; i++){
              value += fogNoise(coord) * scale;
              coord *= 2.0;
              scale *= 0.5;
            }
            return value + 0.2;
          }

          float brightness(vec3 color){
            return (color.r + color.g + color.b) / 3.0;
          }

          float ns;
          float sFract(float x, float sm){
            const float sf = 1.0;
            vec2 u = vec2(x, fwidth(x) * sf * sm);
            u.x = fract(u.x);
            u += (1.0 - 2.0 * u) * step(u.y, u.x);
            return clamp(1.0 - u.x / u.y, 0.0, 1.0);
          }

          float sFloor(float x){
            return x - sFract(x, 1.0);
          }

          vec3 hash33(vec3 p){
            float n = sin(dot(p, vec3(7.0, 157.0, 113.0)));
            return fract(vec3(2097152.0, 262144.0, 32768.0) * n) * 2.0 - 1.0;
          }

          float tetraNoise(vec3 p){
            vec3 i = floor(p + dot(p, vec3(1.0 / 3.0)));
            p -= i - dot(i, vec3(1.0 / 6.0));
            vec3 i1 = step(p.yzx, p);
            vec3 i2 = max(i1, 1.0 - i1.zxy);
            i1 = min(i1, 1.0 - i1.zxy);
            vec3 p1 = p - i1 + 1.0 / 6.0;
            vec3 p2 = p - i2 + 1.0 / 3.0;
            vec3 p3 = p - 0.5;
            vec4 v = max(0.5 - vec4(dot(p, p), dot(p1, p1), dot(p2, p2), dot(p3, p3)), 0.0);
            vec4 d = vec4(dot(p, hash33(i)), dot(p1, hash33(i + i1)), dot(p2, hash33(i + i2)), dot(p3, hash33(i + 1.0)));
            return clamp(dot(d, v * v * v * 8.0) * 1.732 + 0.5, 0.0, 2.0);
          }

          float snowFunc(vec2 p){
            float n = tetraNoise(vec3(p.x * 4.0, p.y * 4.0, 0.0) - vec3(0.0, 0.25, 0.5) * uSnowTime);
            float taper = dot(p, p * vec2(0.35, 1.0));
            n = max(n - taper, 0.0) / max(1.0 - taper, 0.0001);
            ns = n;
            const float palNum = 100.0;
            return n * 0.25 + clamp(sFloor(n * (palNum - 0.001)) / (palNum - 1.0), 0.0, 1.0) * 0.75;
          }

          float coolSnowNoise(){
            vec2 u = (gl_FragCoord.xy - uTextureSize.xy * 0.4) / uTextureSize.y;
            float f = snowFunc(u);
            return f * 0.4 + ns * 0.6;
          }

          vec3 officialSnowPass(vec2 pixel, float startingLayers, float layers, float depth, float width, float speed, float bright, float melts){
            if(bright <= 0.0 || layers <= startingLayers) return vec3(0.0);
            vec2 uvCentered = (2.0 * pixel) / uRes.y;
            uvCentered.y *= -1.0;
            if(uSnowPixely > 0.5) uvCentered = floor(uvCentered / 0.009) * 0.009;

            float meltiness = abs(1.0 - ((pixel.y - uSnowMeltRect.y) / max(0.001, uSnowMeltRect.w)));
            if(pixel.y >= uSnowMeltRect.y + uSnowMeltRect.w) meltiness = 0.0;

            vec3 acc = vec3(0.0);
            float dof = 5.0 * sin(uSnowTime * 0.1);
            for(int i = 1; i < 40; i++){
              float fi = float(i);
              if(fi >= startingLayers && fi < layers){
                vec2 q = uvCentered * (1.0 + fi * depth);
                q += vec2(
                  q.y * ((width * (uSnowPixely > 0.5 ? 1.5 : 1.0)) * mod(fi * 7.238917, 1.0) - (width * (uSnowPixely > 0.5 ? 1.5 : 1.0)) * 0.5) + (((speed * ((layers - fi) * 0.2)) * (uSnowTime * 0.4))),
                  speed * uSnowTime / (1.0 + fi * depth * 0.03)
                );
                vec3 n = vec3(floor(q), 31.189 + fi);
                vec3 m = floor(n) * 0.00001 + fract(n);
                vec3 mp = (31415.9 + m) / fract(mat3(13.323122, 23.5112, 21.71123, 21.1212, 28.7312, 11.9312, 21.8112, 14.7212, 61.3934) * m);
                vec3 r = fract(mp);
                vec2 s = abs(mod(q, 1.0) - 0.5 + 0.9 * r.xy - 0.45);
                s += 0.01 * abs(2.0 * fract(10.0 * q.yx) - 1.0);
                float d = 0.6 * max(s.x - s.y, s.x + s.y) + max(s.x, s.y) - 0.01;
                float edge = 0.005 + 0.05 * min(0.5 * abs(fi - 5.0 - dof), 1.0);
                acc += vec3(smoothstep(edge, -edge, d) * (r.x / (1.0 + 0.02 * fi * depth)));
              }
            }

            vec4 rect = vec4(
              (uSnowMeltRect.x / uTextureSize.x) * uRes.x,
              (uSnowMeltRect.y / uTextureSize.y) * uRes.y,
              (uSnowMeltRect.z / uTextureSize.x) * uRes.x,
              (uSnowMeltRect.w / uTextureSize.y) * uRes.y
            );
            rect.xy += uTextureSize.xy - uRes.xy;
            if(melts > 0.5 && pixel.x >= rect.x && pixel.x < rect.x + rect.z && pixel.y >= rect.y){
              acc *= meltiness;
            }

            vec3 effect = acc * 0.8 * (0.6 + coolSnowNoise() * 0.4);
            return effect * (uSnowPixely > 0.5 ? 1.6 : 1.0) * bright;
          }

          vec4 sampleDustin(vec2 uv){
            uv = clamp(uv, vec2(0.0), vec2(1.0));
            if(uChromDistortion > 0.0001){
              float r = texture2D(uTexture, pincushionDistortion(uv, ((0.3 * uChromDistortion) * 0.9) + (uChromDistortion * 0.1))).r;
              float g = texture2D(uTexture, pincushionDistortion(uv, ((0.15 * uChromDistortion) * 0.9) + (uChromDistortion * 0.1))).g;
              float b = texture2D(uTexture, pincushionDistortion(uv, ((0.075 * uChromDistortion) * 0.9) + (uChromDistortion * 0.1))).b;
              return vec4(r, g, b, texture2D(uTexture, uv).a);
            }
            return texture2D(uTexture, uv);
          }

          vec2 worldCoordFor(vec2 uv){
            vec2 normalizedCoord = gl_FragCoord.xy / uTextureSize.xy;
            vec2 ndc = normalizedCoord * 2.0 - 1.0;
            ndc /= max(0.001, uCameraZoom);
            vec2 zoomedScreenCoord = (ndc + 1.0) * 0.5 * uRes;
            return zoomedScreenCoord + uCameraPosition;
          }

          vec2 snowPixelFor(){
            vec2 trueFragCoord = gl_FragCoord.xy * (uRes / uTextureSize);
            vec2 centeredPixel = trueFragCoord - uRes.xy * 0.5;
            vec2 zoomedCenteredPixel = centeredPixel * (1.0 / (uCameraZoom + 1.0));
            return zoomedCenteredPixel + uRes.xy * 0.5 + uCameraPosition.xy;
          }

          void main(){
            vec2 uv = vUv;
            float blockSize = max(1.0, uPixelBlockSize);
            if(blockSize > 1.001){
              vec2 blocks = ((uRes + vec2(0.5, 0.5)) / blockSize) - vec2(0.5, 0.5);
              vec2 texCoords = (uv * blocks) + (0.5 / uRes);
              uv = floor(texCoords) / blocks;
            }

            if(uGlitchAmount > 0.0001){
              uv.x += (glitchNoise(vec2(uv.y, uTime)) - 0.5) * 0.002;
              uv.x += (glitchNoise(vec2(uv.y * 100.0, uTime * 10.0)) - 0.5) * (0.01 * uGlitchAmount);
            }

            if(uWaterStrength > 0.0001){
              vec2 p = uv;
              p.y += uTime * 0.1;
              vec2 dstOffset = (vec4(waterNoise(p * vec2(30.0))).xy - vec2(0.3, 0.3)) * uWaterStrength * 0.03;
              uv += dstOffset;
            }

            vec4 color = sampleDustin(uv);

            if(uGlitchAmount > 0.0001){
              float ogAlpha = color.a;
              color *= 1.0 + clamp(glitchNoise(vec2(0.0, uv.y + uTime * 0.2)) * 0.6 - 0.25, 0.0, 0.1);
              color.a = ogAlpha;
            }

            if(uStaticStrength > 0.0001){
              color.xyz *= (1.0 + (rand2(uv + uTime * 0.01) - 0.2) * (uStaticStrength * 0.15));
            }

            if(uGrayness > 0.0001){
              vec3 greyScale = vec3(dot(color.rgb, vec3(0.25)));
              color = vec4((color.rgb * abs(1.0 - uGrayness)) + (greyScale * uGrayness), color.a);
            }

            vec2 worldCoord = worldCoordFor(uv);
            vec2 snowPixel = snowPixelFor();
            vec3 snowA = officialSnowPass(snowPixel, 7.0, uSnowLayersA, 1.2, 0.13, 0.6, uSnowBrightA, uSnowMeltsA);
            vec3 snowB = officialSnowPass(snowPixel, 1.0, uSnowLayersB, 1.5, 0.13, 0.3, uSnowBrightB, uSnowMeltsB);
            vec3 snowEffect = snowA + snowB;
            color.rgb += snowEffect;
            if(color.a == 0.0 && brightness(snowEffect) > 0.0) color.a = brightness(snowEffect);

            if(uFogIntensity > 0.0001 && uFogApplyRange > 0.0){
              vec2 st = worldCoord.xy / uRes.xy;
              st *= uRes.xy / uRes.y;
              vec2 pos = vec2(st * 3.0);
              vec2 motion = vec2(fogFbm(pos + vec2(uTime * -0.2, uTime * -0.2)));
              float fogAmount = fogFbm(pos + motion) * uFogIntensity;
              vec3 fogColor = vec3(166.0 / 255.0, 185.0 / 255.0, 189.0 / 255.0);
              vec3 bg = vec3(0.0);
              float gradient = 0.0;
              if(worldCoord.y <= uFogApplyY && worldCoord.y >= uFogApplyY - uFogApplyRange){
                float dist = uFogApplyY - worldCoord.y;
                gradient = 1.0 - (dist / uFogApplyRange);
              } else if(worldCoord.y <= uFogApplyY + 100.0 && worldCoord.y >= uFogApplyY){
                float dist = (uFogApplyY + 100.0) - worldCoord.y;
                gradient = dist / 100.0;
              }
              if(gradient > 0.0){
                vec3 fogEffect = mix(bg, fogColor, fogAmount * gradient);
                vec3 effect = fogEffect * vec3(gradient * fogAmount);
                color.rgb += effect;
                if(color.a == 0.0 && brightness(effect) > 0.0) color.a = brightness(effect);
              }

              if(worldCoord.y <= uFogApplyY && worldCoord.y >= uFogApplyY - 1000.0 && color.a > 0.5){
                float dist = uFogApplyY - worldCoord.y;
                float g = 1.0 - (dist / 1000.0);
                vec3 gradientCol = mix(vec3(0.0), fogColor * 1.3, g);
                color += vec4(gradientCol * 2.0, 1.0) * (g * 0.06) * color.a;
              }
            }

            if(uBloomBrightness > 0.0001 && uBloomSize > 0.0001){
              vec4 bloom = vec4(0.0);
              float weightSum = 0.0;
              for(float d = 0.0; d < TWO_PI; d += 0.39269908169){
                for(float i = 1.0; i <= 3.0; i += 1.0){
                  float offset = (i / 3.0) * uBloomSize;
                  float xOffset = (sin(d) * offset) / uTextureSize.y;
                  float yOffset = (cos(d) * offset) / uTextureSize.x;
                  vec2 sampleUv = clamp(uv + vec2(xOffset, yOffset), vec2(0.0), vec2(1.0));
                  vec4 sampleColor = max(texture2D(uTexture, sampleUv) - uBloomThreshold, 0.0);
                  float weight = exp(-2.0 * (i / 3.0));
                  bloom += sampleColor * weight;
                  weightSum += weight;
                }
              }
              if(weightSum > 0.0) bloom /= weightSum;
              color += bloom * uBloomBrightness;
            }

            gl_FragColor = color;
          }
        `);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
          -1, -1, 0, 0,
           1, -1, 1, 0,
          -1,  1, 0, 1,
           1,  1, 1, 1
        ]), gl.STATIC_DRAW);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        state.dustinPost = {
          program,
          buffer,
          texture,
          aPosition: gl.getAttribLocation(program, "aPosition"),
          aTexCoord: gl.getAttribLocation(program, "aTexCoord"),
          uTexture: gl.getUniformLocation(program, "uTexture"),
          uTextureSize: gl.getUniformLocation(program, "uTextureSize"),
          uRes: gl.getUniformLocation(program, "uRes"),
          uTime: gl.getUniformLocation(program, "uTime"),
          uGrayness: gl.getUniformLocation(program, "uGrayness"),
          uStaticStrength: gl.getUniformLocation(program, "uStaticStrength"),
          uChromDistortion: gl.getUniformLocation(program, "uChromDistortion"),
          uWaterStrength: gl.getUniformLocation(program, "uWaterStrength"),
          uGlitchAmount: gl.getUniformLocation(program, "uGlitchAmount"),
          uPixelBlockSize: gl.getUniformLocation(program, "uPixelBlockSize"),
          uBloomBrightness: gl.getUniformLocation(program, "uBloomBrightness"),
          uBloomSize: gl.getUniformLocation(program, "uBloomSize"),
          uBloomThreshold: gl.getUniformLocation(program, "uBloomThreshold"),
          uFogIntensity: gl.getUniformLocation(program, "uFogIntensity"),
          uFogApplyY: gl.getUniformLocation(program, "uFogApplyY"),
          uFogApplyRange: gl.getUniformLocation(program, "uFogApplyRange"),
          uCameraZoom: gl.getUniformLocation(program, "uCameraZoom"),
          uCameraPosition: gl.getUniformLocation(program, "uCameraPosition"),
          uSnowTime: gl.getUniformLocation(program, "uSnowTime"),
          uSnowBrightA: gl.getUniformLocation(program, "uSnowBrightA"),
          uSnowBrightB: gl.getUniformLocation(program, "uSnowBrightB"),
          uSnowLayersA: gl.getUniformLocation(program, "uSnowLayersA"),
          uSnowLayersB: gl.getUniformLocation(program, "uSnowLayersB"),
          uSnowPixely: gl.getUniformLocation(program, "uSnowPixely"),
          uSnowMeltsA: gl.getUniformLocation(program, "uSnowMeltsA"),
          uSnowMeltsB: gl.getUniformLocation(program, "uSnowMeltsB"),
          uSnowMeltRect: gl.getUniformLocation(program, "uSnowMeltRect")
        };
        return state.dustinPost;
      } catch(error) {
        markFailed(error);
        return null;
      }
    }

    function drawCameraPass(source, params){
      if(window.PERFORMANCE_MODE || !source) return false;
      const gl = ensureContext();
      const pass = gl && ensureCameraPass();
      if(!gl || !pass || !syncSize()) return false;
      if(typeof gl.isContextLost === "function" && gl.isContextLost()) return markFailed("WebGL context lost");
      try {
        gl.viewport(0, 0, state.width, state.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(pass.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, pass.buffer);
        gl.enableVertexAttribArray(pass.aPosition);
        gl.vertexAttribPointer(pass.aPosition, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(pass.aTexCoord);
        gl.vertexAttribPointer(pass.aTexCoord, 2, gl.FLOAT, false, 16, 8);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pass.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.uniform1i(pass.uTexture, 0);
        gl.uniform1f(pass.uZoom, clamp(params?.zoom ?? 1, 0.35, 2.4));
        gl.uniform1f(pass.uAngle, clamp(params?.angle ?? 0, -180, 180));
        gl.uniform2f(pass.uOffset, clamp(params?.offsetX ?? 0, -1.5, 1.5), clamp(params?.offsetY ?? 0, -1.5, 1.5));
        gl.uniform1f(pass.uWarp, clamp(params?.warp ?? 0, -1.2, 1.2));
        gl.uniform1f(pass.uMirror, clamp(params?.mirror ?? 0, 0, 1.4));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const error = gl.getError();
        if(error !== gl.NO_ERROR) throw new Error("WebGL error " + error);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(state.fxCanvas, 0, 0, canvas.width, canvas.height);
        return true;
      } catch(error) {
        return markFailed(error);
      }
    }

    function drawParallaxPass(source, params){
      if(window.PERFORMANCE_MODE || window.REDUCE_MOTION || !source) return false;
      const amount = clamp(params?.amount ?? 0, 0, 1);
      if(amount <= 0.003) return false;
      const gl = ensureContext();
      const pass = gl && ensureParallaxPass();
      if(!gl || !pass || !syncSize()) return false;
      if(typeof gl.isContextLost === "function" && gl.isContextLost()) return markFailed("WebGL context lost");
      try {
        gl.viewport(0, 0, state.width, state.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(pass.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, pass.buffer);
        gl.enableVertexAttribArray(pass.aPosition);
        gl.vertexAttribPointer(pass.aPosition, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(pass.aTexCoord);
        gl.vertexAttribPointer(pass.aTexCoord, 2, gl.FLOAT, false, 16, 8);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pass.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.uniform1i(pass.uTexture, 0);
        gl.uniform1f(pass.uAmount, amount);
        gl.uniform1f(pass.uTime, Number(params?.time || 0));
        gl.uniform2f(pass.uCamera, clamp(params?.cameraX ?? 0, -1, 1), clamp(params?.cameraY ?? 0, -1, 1));
        gl.uniform1f(pass.uZoom, clamp(params?.zoom ?? 0, 0, 1.5));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const error = gl.getError();
        if(error !== gl.NO_ERROR) throw new Error("WebGL error " + error);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(state.fxCanvas, 0, 0, canvas.width, canvas.height);
        return true;
      } catch(error) {
        return markFailed(error);
      }
    }

    function drawSpeedLines(amount, time, params){
      if(window.PERFORMANCE_MODE || window.REDUCE_MOTION) return false;
      const effect = clamp(amount, 0, 0.25);
      if(effect <= 0.004) return false;
      const gl = ensureContext();
      const pass = gl && ensureSpeedLinePass();
      if(!gl || !pass || !syncSize()) return false;
      if(typeof gl.isContextLost === "function" && gl.isContextLost()) return markFailed("WebGL context lost");
      try {
        gl.viewport(0, 0, state.width, state.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(pass.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, pass.buffer);
        gl.enableVertexAttribArray(pass.aPosition);
        gl.vertexAttribPointer(pass.aPosition, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(pass.aTexCoord);
        gl.vertexAttribPointer(pass.aTexCoord, 2, gl.FLOAT, false, 16, 8);
        gl.uniform1f(pass.uTime, Number(time || 0));
        gl.uniform1f(pass.uEffect, effect);
        gl.uniform2f(pass.uCenter, clamp(params?.centerX ?? 0.5, 0, 1), clamp(params?.centerY ?? 0.5, 0, 1));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const error = gl.getError();
        if(error !== gl.NO_ERROR) throw new Error("WebGL error " + error);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = clamp(params?.alpha ?? 1, 0, 1);
        ctx.drawImage(state.fxCanvas, 0, 0, canvas.width, canvas.height);
        ctx.restore();
        return true;
      } catch(error) {
        return markFailed(error);
      }
    }

    function drawDustinPostStack(source, params){
      if(window.PERFORMANCE_MODE || !source) return false;
      const gl = ensureContext();
      const pass = gl && ensureDustinPostPass();
      if(!gl || !pass || !syncSize()) return false;
      if(typeof gl.isContextLost === "function" && gl.isContextLost()) return markFailed("WebGL context lost");
      try {
        gl.viewport(0, 0, state.width, state.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(pass.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, pass.buffer);
        gl.enableVertexAttribArray(pass.aPosition);
        gl.vertexAttribPointer(pass.aPosition, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(pass.aTexCoord);
        gl.vertexAttribPointer(pass.aTexCoord, 2, gl.FLOAT, false, 16, 8);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pass.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.uniform1i(pass.uTexture, 0);
        gl.uniform2f(pass.uTextureSize, state.width, state.height);
        gl.uniform2f(pass.uRes, clamp(params?.resX ?? 1280, 1, 4096), clamp(params?.resY ?? 720, 1, 4096));
        gl.uniform1f(pass.uTime, Number(params?.time || 0));
        gl.uniform1f(pass.uGrayness, clamp(params?.grayness ?? 0, 0, 1));
        gl.uniform1f(pass.uStaticStrength, clamp(params?.staticStrength ?? 0, 0, 8));
        gl.uniform1f(pass.uChromDistortion, clamp(params?.chromDistortion ?? 0, 0, 2));
        gl.uniform1f(pass.uWaterStrength, clamp(params?.waterStrength ?? 0, 0, 2));
        gl.uniform1f(pass.uGlitchAmount, clamp(params?.glitchAmount ?? 0, 0, 4));
        gl.uniform1f(pass.uPixelBlockSize, clamp(params?.pixelBlockSize ?? 1, 1, 64));
        gl.uniform1f(pass.uBloomBrightness, clamp(params?.bloomBrightness ?? 0, 0, 4));
        gl.uniform1f(pass.uBloomSize, clamp(params?.bloomSize ?? 0, 0, 64));
        gl.uniform1f(pass.uBloomThreshold, clamp(params?.bloomThreshold ?? 0.5, 0, 2));
        gl.uniform1f(pass.uFogIntensity, clamp(params?.fogIntensity ?? 0, 0, 3));
        gl.uniform1f(pass.uFogApplyY, clamp(params?.fogApplyY ?? 999999, -999999, 999999));
        gl.uniform1f(pass.uFogApplyRange, clamp(params?.fogApplyRange ?? 0, 0, 4096));
        gl.uniform1f(pass.uCameraZoom, clamp(params?.cameraZoom ?? 1, 0.05, 4));
        gl.uniform2f(pass.uCameraPosition, clamp(params?.cameraX ?? 0, -999999, 999999), clamp(params?.cameraY ?? 0, -999999, 999999));
        const snowMeltRect = Array.isArray(params?.snowMeltRect) ? params.snowMeltRect : [1000, 1220, 1500, 100];
        gl.uniform1f(pass.uSnowTime, Number(params?.snowTime || 0));
        gl.uniform1f(pass.uSnowBrightA, clamp(params?.snowBrightA ?? 0, 0, 6));
        gl.uniform1f(pass.uSnowBrightB, clamp(params?.snowBrightB ?? 0, 0, 6));
        gl.uniform1f(pass.uSnowLayersA, clamp(params?.snowLayersA ?? 0, 0, 39));
        gl.uniform1f(pass.uSnowLayersB, clamp(params?.snowLayersB ?? 0, 0, 39));
        gl.uniform1f(pass.uSnowPixely, params?.snowPixely ? 1 : 0);
        gl.uniform1f(pass.uSnowMeltsA, params?.snowMeltsA === false ? 0 : 1);
        gl.uniform1f(pass.uSnowMeltsB, params?.snowMeltsB === false ? 0 : 1);
        gl.uniform4f(
          pass.uSnowMeltRect,
          clamp(snowMeltRect[0] ?? 1000, -4096, 8192),
          clamp(snowMeltRect[1] ?? 1220, -4096, 8192),
          clamp(snowMeltRect[2] ?? 1500, 0, 8192),
          clamp(snowMeltRect[3] ?? 100, 0.001, 8192)
        );
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const error = gl.getError();
        if(error !== gl.NO_ERROR) throw new Error("WebGL error " + error);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(state.fxCanvas, 0, 0, canvas.width, canvas.height);
        return true;
      } catch(error) {
        return markFailed(error);
      }
    }

    return {
      drawCameraPass,
      drawParallaxPass,
      drawSpeedLines,
      drawDustinPostStack,
      status(){
        return {
          available: !!state.gl && !state.failed,
          failed: state.failed,
          reason: state.failReason,
          width: state.width,
          height: state.height
        };
      }
    };
  }

  window.FNFWebGLBridge = { create: createBridge };
})();
