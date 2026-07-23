#pragma header

vec2 fragCoord = openfl_TextureCoordv*openfl_TextureSize;
vec2 iResolution = openfl_TextureSize;
uniform float iTime;
#define iChannel0 bitmap
#define texture texture2D
#define fragColor gl_FragColor
#define mainImage main 

mat2 r2d(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, s, -s, c);
}

float de(vec3 p) {
    p.y += cos(iTime * 2.0) * 0.2;

    p.xy *= r2d(iTime + p.z);

    vec3 r;
    float d = 0.0, s = 1.0;

    for (int i = 0; i < 3; i++) {
        r = max(r = abs(mod(p * s + 1.0, 2.0) - 1.0), r.yzx);
        d = max(d, (0.9 - min(r.x, min(r.y, r.z))) / s);
        s *= 3.0;
    }

    return d;
}

void main() {
    vec2 uv = fragCoord.xy / iResolution.xy - .5;
    uv.x *= iResolution.x / iResolution.y;

    vec3 ro = vec3(.1*cos(iTime), 0, -iTime), p;
    vec3 rd = normalize(vec3(uv, -1));
    p = ro;

    float it = 0.;
    for (float i=0.; i < 1.; i += .01) {
        it = i;
        float d = de(p);
        if (d < .0001) break;
        p += rd * d*.4;
    }
    it /= .4 * sqrt(abs(tan(iTime) + p.x*p.x + p.y*p.y));

    vec3 c = mix(vec3(.1, .1, .3), vec3(.7, .1, .3), it*sin(p.z));

    fragColor = vec4(c, 1.0);
}