#pragma header

uniform float hue;

vec3 applyHue(vec3 aColor, float aHue){
	float angle = radians(aHue);
	vec3 k = vec3(0.57735, 0.57735, 0.57735);
	float cosAngle = cos(angle);
	return aColor * cosAngle + cross(k, aColor) * sin(angle) + k * dot(k, aColor) * (1.0 - cosAngle);
}

void main(){

	vec4 textureColor = flixel_texture2D(bitmap, openfl_TextureCoordv);

	vec3 outColor = applyHue(textureColor.rgb, hue*255);

	gl_FragColor = vec4(outColor, textureColor.a);
}