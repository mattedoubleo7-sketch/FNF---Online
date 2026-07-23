#pragma header

uniform float hueFactor;
vec2 fragCoord = openfl_TextureCoordv*openfl_TextureSize;
vec2 iResolution = openfl_TextureSize;

vec3 rgb_to_hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs((q.z + (q.w - q.y) / (6.0 * d + e))), d / (q.x + e), q.x);
}

vec3 hsv_to_rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - vec3(3.0));
    return c.z * mix(vec3(1.0), clamp(p - vec3(1.0), 0.0, 1.0), c.y);
}

void main() {
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec3 color = texture2D(bitmap, uv).rgb;

    vec3 hsv = rgb_to_hsv(color);
    hsv.x = mod(hsv.x + hueFactor, 1.0);
    color = hsv_to_rgb(hsv);

    gl_FragColor = vec4(color, 1.0);
}