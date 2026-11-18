export default function Film() {return <scene id="cut08e" name="往回看，盒盖还在手里" active width={1080} height={1920} fill="#2a2424" workarea={[0,34]}>
<sequence id="movement08" name="movement08">
<video id="08shot0" src="zipper.mp4" start={0} end={3} sourceIn={0.2} x={72} y={280} width={936} height={1350} muted/>
<video id="08shot1" src="lid-opens.mp4" start={3} end={4.5} sourceIn={.3} x={72} y={280} width={936} height={1350} muted/>

<video id="08shot3" src="fronds.mp4" start={4.5} end={12.1} sourceIn={.5} x={72} y={280} width={936} height={1350} muted/>
<video id="08shot4" src="table.mp4" start={12.1} end={16.3} sourceIn={1.8} x={72} y={280} width={936} height={1350} muted/>
<video id="08shot5" src="leave.mp4" start={16.3} end={21.1} sourceIn={0.6} x={72} y={280} width={936} height={1350} muted/>
<video id="08shot6" src="looking-in.mp4" start={21.1} end={28.2} sourceIn={0.1} x={72} y={280} width={936} height={1350} muted/>
<video id="08shot7" src="lid-opens.mp4" start={28.2} end={34} sourceIn={0.15} x={72} y={280} width={936} height={1350} muted/>
</sequence>
<text id="start" fontFamily="PingFang SC" fontSize={54} color="#f4e4c6" start={0.25} end={3} x={74} y={133} width={950} height={140}>合上背包以后</text>
<text id="memory" fontFamily="PingFang SC" fontSize={49} color="#f4e4c6" start={27.7} end={32.5} x={74} y={1688} width={950} height={140}>我又想起那个盒盖。</text>
<audio id="musiccut08" src="08-pickup.wav" start={0} end={34}/>
</scene>;}