//edit of https://www.shadertoy.com/view/MdjfRK#
#pragma header
uniform float iTime;

float rand(vec2 n) {
    return fract(sin(dot(n, vec2(12.9898,12.1414))) * 83758.5453);
}

float noise(vec2 n) {
    const vec2 d = vec2(0.0, 1.0);
    vec2 b = floor(n);
    vec2 f = mix(vec2(0.0), vec2(1.0), fract(n));
    return mix(mix(rand(b), rand(b + d.yx), f.x), mix(rand(b + d.xy), rand(b + d.yy), f.x), f.y);
}

vec3 ramp(float t) {
	return t <= .5 ? vec3( 1. - t * 1.4, .2, 1.05 ) / t : vec3( .3 * (1. - t) * 2., .2, 1.05 ) / t;
}

float fire(vec2 n) {
    return noise(n) + noise(n * 2.1) * .6 + noise(n * 5.4) * .42;
}

void main() {
	
    float t = iTime;
    vec2 uv = openfl_TextureCoordv;
    
    //uv.x += uv.y < .5 ? 23.0 + t * .35 : -11.0 + t * .3;    
    //uv.y = abs(uv.y - .5);
    uv *= 5.0;
    
    float q = fire(uv - t * .013) / 3.0;
    vec2 r = vec2(fire(uv + q / 2.0 + t - uv.x - uv.y), fire(uv + q - t));
    vec3 color = vec3(0.0);
    
    float grad = pow((r.y + r.y) * max(0.0, uv.y), 2.0);
    float grad2 = pow((r.y + r.y) * max(0.0, (0.0-uv.y) + 5.0), 2.0);
    float grad3 = pow((r.y + r.y) * max(0.0, uv.x), 2.0);
    float grad4 = pow((r.y + r.y) * max(0.0, (0.0-uv.x) + 5.0), 2.0);
    color = ramp(grad) + ramp(grad2) + ramp(grad3) + ramp(grad4);
    color /= (1.50 + max(vec3(0.0), color));



    gl_FragColor = flixel_texture2D(bitmap, openfl_TextureCoordv) + vec4(color, length(color)*0.1);
}