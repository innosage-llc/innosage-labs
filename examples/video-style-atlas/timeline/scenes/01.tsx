export default function Film(){return <scene id="film01" name="红灯的时候" active width={1080} height={1920} fill="#101817" workarea={[0,36]}>
<sequence id="n1011" name="Picture">
<video id="n1001" src="redlight.mp4" start={0} end={7} x={0} y={240} width={1080} height={1440} muted >
</video>
<video id="n1002" src="coffee.mp4" start={7} end={12} x={0} y={240} width={1080} height={1440} muted >
</video>
<video id="n1003" src="leave.mp4" start={12} end={17} x={0} y={240} width={1080} height={1440} muted >
</video>
<video id="n1004" src="meal.mp4" start={17} end={23} x={0} y={240} width={1080} height={1440} muted >
</video>
<video id="n1005" src="avenue.mp4" start={23} end={30} x={0} y={240} width={1080} height={1440} muted >
</video>
<video id="n1006" src="cup.mp4" start={30} end={36} x={0} y={240} width={1080} height={1440} muted >
</video>
</sequence>
<text id="n1008" x={80} y={95} width={920} height={180} fontFamily="PingFang SC" fontSize={55} color="#e9e5da" start={0} end={6} >红灯的时候<animation id="n1007" type="fade" duration={0.3}>
</animation>
</text>
<text id="n1010" x={80} y={1740} width={920} height={180} fontFamily="PingFang SC" fontSize={45} color="#e9e5da" start={28} end={36} >等一等，也在向前。<animation id="n1009" type="fade" duration={0.3}>
</animation>
</text>
<audio id="n1012" src="01-ambient-phrased.wav" start={0} end={36}>
</audio>
</scene>;}
