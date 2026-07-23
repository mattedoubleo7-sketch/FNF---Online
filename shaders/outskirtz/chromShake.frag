// Automatically converted with https://github.com/TheLeerName/ShadertoyToFlixel

#pragma header

#define round(a) floor(a + 0.5)
#define iResolution vec3(openfl_TextureSize, 0.)
uniform float iTime;
#define iChannel0 bitmap
uniform sampler2D iChannel1;
uniform sampler2D iChannel2;
uniform sampler2D iChannel3;
#define texture flixel_texture2D

// third argument fix
vec4 flixel_texture2D(sampler2D bitmap, vec2 coord, float bias) {
	vec4 color = texture2D(bitmap, coord, bias);
	if (!hasTransform)
	{
		return color;
	}
	if (color.a == 0.0)
	{
		return vec4(0.0, 0.0, 0.0, 0.0);
	}
	if (!hasColorTransform)
	{
		return color * openfl_Alphav;
	}
	color = vec4(color.rgb / color.a, color.a);
	mat4 colorMultiplier = mat4(0);
	colorMultiplier[0][0] = openfl_ColorMultiplierv.x;
	colorMultiplier[1][1] = openfl_ColorMultiplierv.y;
	colorMultiplier[2][2] = openfl_ColorMultiplierv.z;
	colorMultiplier[3][3] = openfl_ColorMultiplierv.w;
	color = clamp(openfl_ColorOffsetv + (color * colorMultiplier), 0.0, 1.0);
	if (color.a > 0.0)
	{
		return vec4(color.rgb * color.a * openfl_Alphav, color.a * openfl_Alphav);
	}
	return vec4(0.0, 0.0, 0.0, 0.0);
}

// variables which is empty, they need just to avoid crashing shader
uniform float iTimeDelta;
uniform float iFrameRate;
uniform int iFrame;
#define iChannelTime float[4](iTime, 0., 0., 0.)
#define iChannelResolution vec3[4](iResolution, vec3(0.), vec3(0.), vec3(0.))
uniform vec4 iMouse;
uniform vec4 iDate;

vec2 random2(float seed)
{
    float rand1 = fract(sin(seed) * 43758.5453123);
    float rand2 = fract(cos(seed) * 23421.631235);
    
    return vec2(rand1, rand2) * 2.0 - 1.0;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{

    float time = iTime * 16.0 + sin(iTime * 15.0) * 0.25;
    vec2 pos_rnd_1 = random2(floor(time));
         pos_rnd_1 = pow(pos_rnd_1, vec2(3.0));
    vec2 pos_rnd_2 = random2(floor(time) + 1.0);
         pos_rnd_2 = pow(pos_rnd_2, vec2(3.0));
    vec2 pos_rnd = mix(pos_rnd_1, pos_rnd_2, fract(time));



    vec2 uv = fragCoord/iResolution.xy;
    uv = (uv - 0.5) * 0.96 + 0.5;
    
    vec2 uv1 = uv + pos_rnd * 0.01;
    vec2 uv2 = uv + pos_rnd * 0.02;
    vec2 uv3 = uv + pos_rnd * 0.04;

    // Time varying pixel color
    float r = texture(iChannel0, uv1).r;
    float g = texture(iChannel0, uv2).g;
    float b = texture(iChannel0, uv3).b;

    vec3 col = vec3(r,g,b);

    // Output to screen
    fragColor = vec4(col ,texture(iChannel0, uv).a);
}

void main() {
	mainImage(gl_FragColor, openfl_TextureCoordv*openfl_TextureSize);
}