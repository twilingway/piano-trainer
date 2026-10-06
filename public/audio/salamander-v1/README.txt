Salamander Grand Piano V3 by Alexander Holm
License: Creative Commons Attribution 3.0 (https://creativecommons.org/licenses/by/3.0/)
Source: https://github.com/sfzinstruments/SalamanderGrandPiano

Files: velocity layers 1, 5, 10 and 15 of the @tonejs/piano mp3 cut
(https://tambien.github.io/Piano/audio/), every minor third from A0 to C8.
Changes: samples longer than 8 s are cut to 8 s with a 1.5 s fade-out:
  ffmpeg -i in.mp3 -t 8 -af "afade=t=out:st=6.5:d=1.5" -c:a libmp3lame -q:a 2 out.mp3
