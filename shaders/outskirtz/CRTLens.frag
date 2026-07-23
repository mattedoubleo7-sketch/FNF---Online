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

float rand(vec2 co, float seed)
{
    return fract(sin(dot(co.xy ,vec2(12.9898 + seed,78.233 - seed))) * 43758.5453);
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
	vec2 uv = fragCoord.xy / iResolution.xy;
	
    float xdist = (.5 - uv.x)*2.;
    float ydist = (.5 - uv.y)*2.;
    float dist = 1. - sqrt(xdist*xdist/2. + ydist*ydist/2.);
    
    float deEffect = 6.;// + abs(cos(iTime));
    
    vec2 lensShift = uv + vec2(xdist*dist/deEffect, ydist*dist/deEffect);
    vec2 colorShift = lensShift - vec2(.01 + .001 * sin(uv.y * 300. + iTime  * 50.), 0.);
    float linearShift = abs(sin(uv.y * 3. + iTime * 20.));
    
    fragColor = 
        texture(iChannel0, lensShift) *  (1. - .1 * rand(uv, iTime))
        / (vec4(1.,1.,1.,1.) - texture(iChannel0, colorShift) + vec4(linearShift, linearShift, linearShift, 1.) * .05) * .3;
        + (-.1 + rand(uv, iTime) * .2);
}

void main() {
	mainImage(gl_FragColor, openfl_TextureCoordv*openfl_TextureSize);
}