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
      speedLines: null
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

    return {
      drawCameraPass,
      drawParallaxPass,
      drawSpeedLines,
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
