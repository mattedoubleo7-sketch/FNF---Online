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

float iter = 50.; // Change this to increase/decrease quality
float bias = 0.5; // 0 to 1; Shift position by point in spectrum
//float scale = 0.03;
//float angle = 0.25;

const float pi = 3.14159265;

vec3 bezcol(in float p){
    float o = pow(p,2.)*(3.-2.*p);;
    return vec3((1.-o)*(1.-o),(1.-o)*o*3.,o*o);
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 res = iResolution.xy;//------For my own use later. Not important.
    
    // For ease-of-control. Comment out and uncomment identical variables
    // above to set a fixed value.
    float angle = iMouse.x/res.x;
    float scale = iMouse.y/res.y/5.+0.03;
    
    vec2 uv = fragCoord/res.xy;
    vec2 offs;
    vec3 col;
    float count;
    for (float i = 0.; i <= 1.; i += 1./iter) {
        offs = vec2(uv.x+sin(angle*pi*2.)*scale*(res.y/res.x)*(i*2.-bias*2.),
                    uv.y+cos(angle*pi*2.)*scale*(i*2.-bias*2.));        
        col += texture(iChannel0,offs).rgb * bezcol(i);
        count+=1.;
    }
    col /= count/2.8;
    
    fragColor = vec4(col,texture(iChannel0, uv).a);
}

void main() {
	mainImage(gl_FragColor, openfl_TextureCoordv*openfl_TextureSize);
}