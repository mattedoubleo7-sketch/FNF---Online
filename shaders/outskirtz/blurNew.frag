#pragma header
#define pow2(x) (x * x)

uniform float amt;
vec2 fragCoord = openfl_TextureCoordv*openfl_TextureSize;
vec2 iResolution = openfl_TextureSize;
const float pi = atan(1.0) * 4.0;
const int samples = 24;
float sigma = float(samples) * amt;

float gaussian(vec2 i) {
    return 1.0 / (2.0 * pi * pow2(sigma)) * exp(-((pow2(i.x) + pow2(i.y)) / (2.0 * pow2(sigma))));
}

vec3 blur(sampler2D sp, vec2 uv, vec2 scale) {
    vec3 col = vec3(0.0);
    float accum = 0.0;
    float weight;
    vec2 offset;
    
    for (int x = -samples / 2; x < samples / 2; ++x) {
        for (int y = -samples / 2; y < samples / 2; ++y) {
            offset = vec2(x, y);
            weight = gaussian(offset);
            col += texture2D(sp, uv + scale * offset).rgb * weight;
            accum += weight;
        }
    }
    
    return col / accum;
}

void main() {
    vec2 ps = vec2(1.0) / iResolution.xy;
    vec2 uv = fragCoord * ps;
    
    gl_FragColor.rgb = blur(bitmap, uv, ps);
    gl_FragColor.a = 1.0;
}